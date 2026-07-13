import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCostCli,
  resolveTokenBudgetFromPattern,
} from '../dist/budget-resolver.js';

test('resolveCostCli finds the monorepo sibling loop-cost CLI', async () => {
  const cli = await resolveCostCli();
  assert.ok(cli, 'expected a resolved CLI path');
  assert.match(cli, /loop-cost[\\/]dist[\\/]cli\.js$/);
});

test('resolveTokenBudgetFromPattern returns the realistic per-run estimate by default', async () => {
  const tokens = await resolveTokenBudgetFromPattern({ pattern: 'ci-sweeper', level: 'L2' });
  assert.equal(typeof tokens, 'number');
  assert.ok(tokens > 0);
});

test('resolveTokenBudgetFromPattern honors --budget-scenario', async () => {
  const realistic = await resolveTokenBudgetFromPattern({ pattern: 'ci-sweeper', level: 'L2', scenario: 'realistic' });
  const action = await resolveTokenBudgetFromPattern({ pattern: 'ci-sweeper', level: 'L2', scenario: 'action' });
  assert.ok(action >= realistic, 'worst-case action scenario should be at least the realistic blend');
});

test('resolveTokenBudgetFromPattern rejects an unknown pattern with loop-cost\'s own message', async () => {
  await assert.rejects(
    () => resolveTokenBudgetFromPattern({ pattern: 'not-a-pattern' }),
    /Unknown pattern: not-a-pattern/,
  );
});

test('resolveTokenBudgetFromPattern rejects an invalid scenario before spawning loop-cost', async () => {
  await assert.rejects(
    () => resolveTokenBudgetFromPattern({ pattern: 'ci-sweeper', scenario: 'garbage' }),
    /Invalid --budget-scenario/,
  );
});
