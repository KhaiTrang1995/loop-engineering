import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

const stagnationLedger = JSON.stringify({
  goal: 'x',
  attempts: [
    { iteration: 1, action: 'a', outcome: 'failure', error: 'boom' },
    { iteration: 2, action: 'a', outcome: 'failure', error: 'boom' },
    { iteration: 3, action: 'a', outcome: 'failure', error: 'boom' },
  ],
});

function runCli(args, input = stagnationLedger) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: 'utf8',
  });
}

test('cli --check trips stagnation with default threshold', () => {
  const r = runCli(['--check', '--json']);
  assert.equal(r.status, 2);
  const decision = JSON.parse(r.stdout);
  assert.equal(decision.trigger, 'stagnation');
});

test('cli rejects invalid --stagnation values before running the breaker', () => {
  const r = runCli(['--check', '--stagnation', 'nope', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--stagnation must be a positive integer/);
});

test('cli rejects invalid --no-progress values', () => {
  const r = runCli(['--check', '--no-progress', '0', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--no-progress must be a positive integer/);
});

test('cli rejects invalid --max-iterations values', () => {
  const r = runCli(['--check', '--max-iterations', '1.5', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--max-iterations must be a positive integer/);
});

test('cli rejects missing numeric flag values', () => {
  const r = runCli(['--check', '--stagnation']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--stagnation requires a positive integer value/);
});

const cheapLedger = JSON.stringify({
  goal: 'x',
  attempts: [{ iteration: 1, action: 'a', outcome: 'success', tokensUsed: 100 }],
});

test('cli resolves --token-budget from --budget-from-pattern', () => {
  const r = runCli(
    ['--check', '--budget-from-pattern', 'ci-sweeper', '--budget-level', 'L2', '--json'],
    cheapLedger,
  );
  assert.equal(r.status, 0);
  const decision = JSON.parse(r.stdout);
  assert.equal(decision.escalate, false);
});

test('cli --token-budget wins over --budget-from-pattern when both are given', () => {
  const r = runCli(
    ['--check', '--budget-from-pattern', 'ci-sweeper', '--token-budget', '50', '--json'],
    cheapLedger,
  );
  assert.equal(r.status, 2);
  const decision = JSON.parse(r.stdout);
  assert.equal(decision.trigger, 'token-budget');
});

test('cli --budget-from-pattern surfaces loop-cost\'s unknown-pattern error', () => {
  const r = runCli(['--check', '--budget-from-pattern', 'not-a-pattern'], cheapLedger);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown pattern: not-a-pattern/);
});
