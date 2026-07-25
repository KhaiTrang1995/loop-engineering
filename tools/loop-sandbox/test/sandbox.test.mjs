import test from 'node:test';
import assert from 'node:assert';
import { runInSandbox, listPatches } from '../dist/sandbox.js';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createWorktree } from '@cobusgreyling/loop-worktree';

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
