import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorktree, isGitRepo, gc } from '@cobusgreyling/loop-worktree';
const runExec = promisify(execFile);
/** Run a git command in cwd, returning stdout trimmed. Throws on error. */
async function git(args, cwd) {
    const { stdout } = await runExec('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
    return stdout.trim();
}
/** Run a git command in cwd, returning raw untrimmed Buffer (for binary patches). Throws on error. */
async function gitRaw(args, cwd) {
    return new Promise((resolve, reject) => {
        execFile('git', args, { cwd, encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
            if (err)
                reject(err);
            else
                resolve(stdout);
        });
    });
}
/**
 * Wraps an agent command in a temporary git worktree sandbox.
 * Returns the patch file path if changes were made.
 */
export async function runInSandbox(root, command, args, options = {}) {
    if (!(await isGitRepo(root))) {
        throw new Error('loop-sandbox must be run inside a git repository.');
    }
    const runId = `sandbox-${crypto.randomBytes(4).toString('hex')}`;
    // 1. Setup paths
    const sandboxDir = path.join(root, '.loop-sandbox');
    const patchesDir = path.join(sandboxDir, 'patches');
    await mkdir(patchesDir, { recursive: true });
    const baseBranch = options.base || await git(['rev-parse', '--abbrev-ref', 'HEAD'], root).catch(() => 'main');
    console.log(`\n📦 Creating ephemeral worktree isolation: ${runId}`);
    // 2. Create the worktree
    const entry = await createWorktree({
        root,
        runId,
        pattern: 'sandbox', // dummy pattern
        base: baseBranch
    });
    const worktreeAbsPath = path.resolve(root, entry.path);
    console.log(`🚀 Executing inside sandbox: ${command} ${args.join(' ')}`);
    let exitCode = null;
    let hasChanges = false;
    let patchFilePath = null;
    let extractionFailed = false;
    // Signal handlers for graceful cleanup if user ctrl+c's during run
    let isCleaningUp = false;
    const cleanup = async () => {
        if (isCleaningUp)
            return;
        isCleaningUp = true;
        if (extractionFailed) {
            console.log(`⚠️ Patch extraction failed. The worktree at ${worktreeAbsPath} and branch loop/${runId} were left on disk for manual recovery.`);
            return;
        }
        console.log(`🧹 Cleaning up sandbox worktree...`);
        try {
            await git(['worktree', 'remove', '--force', worktreeAbsPath], root);
            await git(['branch', '-D', `loop/${runId}`], root).catch(() => { });
            await gc({ root, force: false });
        }
        catch (err) {
            console.error(`❌ Failed to cleanup sandbox worktree. It may need manual removal:`, err);
            process.exitCode = 1;
        }
    };
    const sigHandler = () => {
        cleanup().finally(() => process.exit(1));
    };
    process.on('SIGINT', sigHandler);
    process.on('SIGTERM', sigHandler);
    try {
        // 3. Execute the user's command
        try {
            const child = spawn(command, args, {
                cwd: worktreeAbsPath,
                stdio: 'inherit',
                shell: options.shell ?? false
            });
            exitCode = await new Promise((resolve) => {
                child.on('close', (code) => resolve(code));
                child.on('error', () => resolve(1));
            });
        }
        catch (err) {
            console.error(`❌ Execution failed inside sandbox:`, err);
            exitCode = 1;
        }
        console.log(`\n🔍 Scanning sandbox for changes...`);
        // 4. Extract diff as a patch
        try {
            await git(['add', '-A'], worktreeAbsPath);
            const diffStat = await git(['diff', '--cached', '--stat'], worktreeAbsPath);
            if (diffStat) {
                hasChanges = true;
                patchFilePath = path.join(patchesDir, `${runId}.patch`);
                const diffOutput = await gitRaw(['diff', '--cached', '--binary'], worktreeAbsPath);
                await writeFile(patchFilePath, diffOutput);
                console.log(`✅ Sandbox changes captured to patch: ${patchFilePath}`);
            }
            else {
                console.log(`ℹ️ No changes were made in the sandbox.`);
            }
        }
        catch (err) {
            console.error(`❌ Failed to extract patch from sandbox:`, err);
            extractionFailed = true;
        }
    }
    finally {
        process.removeListener('SIGINT', sigHandler);
        process.removeListener('SIGTERM', sigHandler);
        await cleanup();
    }
    return {
        runId,
        patchFile: patchFilePath,
        exitCode,
        hasChanges
    };
}
/** Lists all available patches in the .loop-sandbox/patches/ directory. */
export async function listPatches(root) {
    const patchesDir = path.join(root, '.loop-sandbox', 'patches');
    try {
        const files = await readdir(patchesDir, { withFileTypes: true });
        const patches = [];
        for (const f of files) {
            if (f.isFile() && f.name.endsWith('.patch')) {
                const patchPath = path.join(patchesDir, f.name);
                const s = await stat(patchPath);
                patches.push({
                    patchName: f.name,
                    patchPath,
                    size: s.size
                });
            }
        }
        return patches;
    }
    catch {
        return [];
    }
}
