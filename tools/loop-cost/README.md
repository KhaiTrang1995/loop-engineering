# loop-cost

Estimate daily token spend for [loop engineering](https://github.com/cobusgreyling/loop-engineering) patterns by cadence and readiness level (L1–L3).

Uses cost metadata from `patterns/registry.yaml`.

## Install & Run

```bash
npx @cobusgreyling/loop-cost --pattern ci-sweeper --cadence 15m --level L2
npx @cobusgreyling/loop-cost --pattern daily-triage --level L1 --json
npx @cobusgreyling/loop-cost --list
```

**From this repo:**

```bash
cd tools/loop-cost
npm install
npm test
```

## Options

| Flag | Description |
|------|-------------|
| `--pattern` | Pattern id (see `--list`) |
| `--cadence` | Override cadence (e.g. `15m`, `1d`) |
| `--level` | `L1`, `L2`, or `L3` (default `L1`) |
| `--conservative` | Use slower cadence from ranges |
| `--json` | Machine-readable output |

## Scenarios

Each estimate includes:

- **Early-exit / no-op** — empty watchlist, minimal tokens
- **Full triage** — every run does a full scan
- **Action every run** — implementer + verifier every time (worst case)
- **Realistic blend** — level-based mix (documented in output)

Pair with `loop-budget.md` (scaffolded by `loop-init`) and `loop-audit` cost observability checks.

## Feed the circuit breaker

[`loop-context`](../loop-context)'s breaker can resolve `--token-budget` directly
from a pattern's realistic per-run estimate instead of a hand-typed guess:

```bash
npx @cobusgreyling/loop-context --check --ledger loop-ledger.json \
  --budget-from-pattern ci-sweeper --budget-level L2
```

`loop-context` shells out to this CLI's built output to do it — the packages stay
independent at the source level, no shared runtime state. An explicit
`--token-budget` on the `loop-context` call always overrides the derived value.

See [docs/operating-loops.md](../../docs/operating-loops.md).