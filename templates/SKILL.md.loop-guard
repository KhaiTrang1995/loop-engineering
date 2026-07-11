---
name: loop-guard
description: >
  Circuit breaker for fix-capable loops. Before each iteration, append the last
  attempt to loop-ledger.json and run loop-context --check; if it escalates,
  stop and hand the human a clean summary instead of looping in vain.
user_invocable: true
---

# Loop Guard (Circuit Breaker)

You keep a fix loop from burning tokens on a problem it cannot solve. You wrap
every iteration of an action skill (`minimal-fix`, `ci-triage`, `dependency-triage`, …)
with a deterministic circuit-breaker check powered by
[`loop-context`](https://github.com/cobusgreyling/loop-engineering/tree/main/tools/loop-context).

The breaker needs no LLM call, so it is cheap enough to run on every iteration.

## The ledger

`loop-ledger.json` records the loop's goal, its pattern/level, and one entry per
attempt:

```json
{ "goal": "Get failing CI green", "pattern": "ci-sweeper", "level": "L2", "attempts": [] }
```

`pattern` and `level` are seeded by `loop-init`; the breaker ignores them but the
budget step below reads them to size `--token-budget` from real cost data.

After every iteration, append what you just tried:

```json
{ "iteration": 3, "action": "patch flaky auth test", "outcome": "failure",
  "error": "AssertionError: expected 200 got 500", "tokensUsed": 1800 }
```

`outcome` is `success | failure | noop`. Always include `error` on failures —
that is how the breaker detects a repeated (stagnant) failure.

## Size the token budget from the pattern

Don't hand-type a token cap — `loop-context` can derive it directly from the
pattern's realistic per-run cost
([`loop-cost`](https://github.com/cobusgreyling/loop-engineering/tree/main/tools/loop-cost)
computes this from `patterns/registry.yaml`) so the breaker trips on genuine
cost blowup, not a made-up number. Substitute the ledger's own `pattern`/`level`
(here: `ci-sweeper` / `L2`):

```bash
npx @cobusgreyling/loop-context --check --ledger loop-ledger.json \
  --budget-from-pattern ci-sweeper --budget-level L2
```

## Before each iteration

1. Append the previous attempt to `loop-ledger.json`.
2. Run the breaker with the resolved budget:
   ```bash
   npx @cobusgreyling/loop-context --check --ledger loop-ledger.json \
     --budget-from-pattern ci-sweeper --budget-level L2
   ```
3. Act on the exit code:
   - **0** → continue. Optionally trim the next prompt first:
     `npx @cobusgreyling/loop-context --inject --ledger loop-ledger.json`
   - **2** → **STOP.** The breaker tripped — same error N× in a row, too many
     consecutive failures, the token budget, or the iteration cap. Do not retry.

## On escalate (exit 2)

1. Capture a clean, pruned summary for the human:
   ```bash
   npx @cobusgreyling/loop-context --inject --ledger loop-ledger.json > escalation.md
   ```
2. Write the escalation into STATE.md High Priority (or open an issue).
3. Exit the loop. A human decides the next step.

## Rules

- Never widen thresholds just to keep looping — escalation is a feature, not a failure.
- Never edit the ledger to hide a repeated error; the breaker exists to catch it.
- Defaults: 3× same error, 5 consecutive failures, 10 iterations. Tune with
  `--stagnation`, `--no-progress`, `--max-iterations`, or an explicit
  `--token-budget` (wins over `--budget-from-pattern` if both are given).

## Interaction with other skills

- `minimal-fix` / `ci-triage` — record each attempt's outcome + error in the ledger.
- `loop-verifier` — a verifier rejection is a `failure`; log it so repeats trip the breaker.
- `loop-constraints` — honors "escalate after N attempts"; this skill makes it mechanical.
- `loop-budget` — the per-run budget here comes from `--budget-from-pattern`;
  loop-budget.md still governs the *daily* cap across runs.
