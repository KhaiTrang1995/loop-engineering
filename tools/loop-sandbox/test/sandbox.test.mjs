import test from 'node:test';
import assert from 'node:assert';
import { runInSandbox, listPatches } from '../dist/sandbox.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdir, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { execSync, spawn } from 'node:child_process';
import { createWorktree } from '@cobusgreyling/loop-worktree';
import { lockPaths, listLocks } from '@cobusgreyling/loop-worktree/dist/lock.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sandboxDistUrl = pathToFileURL(path.join(testDir, '../dist/sandbox.js')).href;

async function setupTestRepo() {
  const dir = path.join(tmpdir(), `sandbox-test-${Date.now()}-${Math.floor(Math.random()*1000)}`);
  await mkdir(dir, { recursive: true });
  execSync('git init -b main', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# Test repo');
  execSync('git add README.md', { cwd: dir });
  execSync('git commit -m "init"', { cwd: dir });
  return dir;
}

test('sandbox run captures patch and cleans up', async () => {
  const root = await setupTestRepo();
  const scriptPath = path.join(root, 'test-script.js');
  await writeFile(scriptPath, 'require("fs").writeFileSync("new-file.txt", "hello sandbox");');
  try {
    const result = await runInSandbox(root, 'node', [scriptPath]);
    
    assert.ok(result.hasChanges);
    assert.ok(result.patchFile);
    assert.equal(result.exitCode, 0);

    const patchStat = await stat(result.patchFile);
    assert.ok(patchStat.size > 0);

    await assert.rejects(stat(path.join(root, 'new-file.txt')));

    const patches = await listPatches(root);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].patchPath, result.patchFile);

  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('cleanup is scoped and leaves other active worktrees alone', async () => {
  const root = await setupTestRepo();
  try {
    // Pre-create an active worktree via loop-worktree API
    const other = await createWorktree({ root, runId: 'other-run', pattern: 'test', base: 'main' });
    const otherPathAbs = path.join(root, other.path);
    await stat(otherPathAbs); // verifies it exists
    
    // Run sandbox
    const result = await runInSandbox(root, 'node', ['-e', 'require("fs").writeFileSync("foo.txt", "bar");']);
    assert.ok(result.hasChanges);
    
    // Verify the other worktree STILL exists
    await stat(otherPathAbs);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('extract failure prevents cleanup to avoid data loss', async () => {
  const root = await setupTestRepo();
  try {
    // Sabotage git by deleting the worktree's metadata inside the parent repo.
    // This makes git add -A fail because the worktree is completely broken.
    const result = await runInSandbox(root, 'node', [
      '-e', 
      'const fs = require("fs"); const gitdir = fs.readFileSync(".git", "utf8").trim().replace("gitdir: ", ""); fs.rmSync(gitdir, {recursive: true, force: true});'
    ]);
    
    assert.equal(result.hasChanges, false);
    
    // The worktree branch and directory should still be on disk
    const statObj = await stat(path.join(root, '.loop-worktrees', result.runId));
    assert.ok(statObj.isDirectory(), 'worktree should remain on disk');
    
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('binary patch captures exactly without utf8 corruption', async () => {
  const root = await setupTestRepo();
  try {
    // Write a binary sequence
    const scriptPath = path.join(root, 'binary-script.js');
    await writeFile(scriptPath, 'require("fs").writeFileSync("binary.bin", Buffer.from([0x00, 0xFF, 0xFE, 0xFD]));');
    
    const result = await runInSandbox(root, 'node', [scriptPath]);
    assert.ok(result.hasChanges);
    
    const patchContent = await readFile(result.patchFile);
    assert.ok(patchContent.toString('ascii').includes('GIT binary patch'));
    
    // Apply the patch to the main repo
    execSync(`git apply ${result.patchFile}`, { cwd: root });
    
    // Verify exact bytes
    const appliedContent = await readFile(path.join(root, 'binary.bin'));
    assert.equal(appliedContent[0], 0x00);
    assert.equal(appliedContent[1], 0xFF);
    assert.equal(appliedContent[2], 0xFE);
    assert.equal(appliedContent[3], 0xFD);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('lockPaths option holds and releases a loop-worktree lock around the run', async () => {
  const root = await setupTestRepo();
  try {
    const result = await runInSandbox(root, 'node', ['-e', 'require("fs").writeFileSync("locked.txt", "x");'], {
      lockPaths: ['src/**'],
      lockOwner: 'lock-test-owner',
    });
    assert.ok(result.hasChanges);

    // The lock must be released once the run completes -- otherwise it would
    // strand future loops out of src/** indefinitely with no TTL set.
    const locks = await listLocks(root);
    assert.equal(locks.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('lockPaths option refuses to run when another owner holds an overlapping lock', async () => {
  const root = await setupTestRepo();
  try {
    await lockPaths({ root, owner: 'other-loop', paths: ['src/**'] });

    await assert.rejects(
      runInSandbox(root, 'node', ['-e', 'require("fs").writeFileSync("should-not-run.txt", "x");'], {
        lockPaths: ['src/nested/**'],
        lockOwner: 'sandbox-test-owner',
      }),
      /locked by owner "other-loop"/,
    );

    // Blocked before the worktree was ever created -- nothing to clean up.
    const worktreeList = execSync('git worktree list --porcelain', { cwd: root, encoding: 'utf8' });
    assert.equal(worktreeList.match(/^worktree /gm)?.length, 1, 'only the main worktree should exist');
    // The other loop's lock is untouched by the rejected attempt.
    const locks = await listLocks(root);
    assert.equal(locks.length, 1);
    assert.equal(locks[0].owner, 'other-loop');
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test('SIGINT mid-run releases the lock instead of stranding it', async () => {
  const root = await setupTestRepo();
  try {
    // Run in a dedicated child process and self-trigger SIGINT via
    // process.emit from inside it -- real OS signal delivery to a spawned
    // process is unreliable to script from a test (especially on Windows),
    // but process.emit('SIGINT') exercises the exact same registered
    // listener a real signal would, without that flakiness. The sandboxed
    // "user command" (setInterval) never exits on its own, so this also
    // covers cleanup() running while the child it's meant to clean up after
    // is still alive.
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      const mod = await import(${JSON.stringify(sandboxDistUrl)});
      mod.runInSandbox(${JSON.stringify(root)}, 'node', ['-e', 'setInterval(() => {}, 1000)'], {
        lockPaths: ['src/**'],
        lockOwner: 'sigint-test-owner',
      }).catch(() => {});
      setTimeout(() => process.emit('SIGINT'), 1000);
    `], { stdio: 'ignore' });

    const exited = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(false), 10_000);
      child.on('exit', () => { clearTimeout(timer); resolve(true); });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    if (!exited) {
      child.kill('SIGKILL');
      assert.fail('child did not exit after synthetic SIGINT within 10s -- the lock is likely stranded');
    }

    const locks = await listLocks(root);
    assert.equal(locks.length, 0, 'lock must be released after SIGINT, not left stranded with no TTL');
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
