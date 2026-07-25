#!/usr/bin/env node
import path from 'node:path';
import { runInSandbox, listPatches } from './sandbox.js';
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
        printHelp();
        process.exit(0);
    }
    const command = args[0];
    const root = process.cwd();
    if (command === 'run') {
        const runArgs = args.slice(1);
        let targetCommandIndex = runArgs.findIndex(a => a === '--');
        if (targetCommandIndex === -1) {
            console.error('❌ Missing `--` separator before the command. Usage: loop-sandbox run [options] -- <command>');
            process.exit(1);
        }
        const sandboxOptionsArgs = runArgs.slice(0, targetCommandIndex);
        const targetCommandArgs = runArgs.slice(targetCommandIndex + 1);
        if (targetCommandArgs.length === 0) {
            console.error('❌ Missing command to run. Usage: loop-sandbox run [options] -- <command>');
            process.exit(1);
        }
        let shell = false;
        let base;
        for (let i = 0; i < sandboxOptionsArgs.length; i++) {
            const arg = sandboxOptionsArgs[i];
            if (arg === '--shell') {
                shell = true;
            }
            else if (arg === '--base') {
                base = sandboxOptionsArgs[++i];
            }
            else {
                console.error(`❌ Unknown option: ${arg}`);
                process.exit(1);
            }
        }
        const exe = targetCommandArgs[0];
        const exeArgs = targetCommandArgs.slice(1);
        try {
            const result = await runInSandbox(root, exe, exeArgs, { shell, base });
            if (result.hasChanges && result.patchFile) {
                console.log('\n==================================================');
                console.log(`🎉 Run completed. Changes isolated successfully!`);
                console.log(`To review the changes, run:`);
                console.log(`  npx @cobusgreyling/loop-sandbox review`);
                console.log(`\nTo apply the changes immediately, run:`);
                console.log(`  git apply ${path.relative(root, result.patchFile)}`);
                console.log('==================================================\n');
            }
            else {
                console.log(`\nℹ️ Run completed with exit code ${result.exitCode ?? 0}. No changes detected.`);
            }
            process.exit(result.exitCode ?? 0);
        }
        catch (err) {
            console.error(`❌ sandbox error: ${err.message}`);
            process.exit(1);
        }
    }
    else if (command === 'review' || command === 'list') {
        try {
            const patches = await listPatches(root);
            if (patches.length === 0) {
                console.log('No sandbox patches found in .loop-sandbox/patches/');
                return;
            }
            console.log('\n=== Loop Sandbox Patches ===\n');
            for (const p of patches) {
                const kb = (p.size / 1024).toFixed(1);
                console.log(`📄 ${p.patchName} (${kb} KB)`);
                console.log(`   Apply: git apply ${path.relative(root, p.patchPath)}`);
            }
            console.log('');
        }
        catch (err) {
            console.error(`❌ sandbox error: ${err.message}`);
            process.exit(1);
        }
    }
    else {
        console.error(`❌ Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
}
function printHelp() {
    console.log(`
loop-sandbox — Ephemeral worktree isolation for agents.

Usage:
  loop-sandbox run [options] -- <command>    Run an agent command inside an isolated worktree.
  loop-sandbox review                        List isolated patches ready for human review.
  
Options for 'run':
  --shell      Run the command inside a shell environment (shell: true)
  --base       The base branch to branch the worktree from (default: current HEAD)
  
Examples:
  npx @cobusgreyling/loop-sandbox run -- node script.js
  npx @cobusgreyling/loop-sandbox run --shell -- bash -c "echo 'hello' > test.txt"
  npx @cobusgreyling/loop-sandbox review
`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
