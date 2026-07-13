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
| `--orchestration` | Multi-agent action cost: `single` (default), `maker-checker`, `parallel:N`, `debate:R` |
| `--conservative` | Use slower cadence from ranges |
| `--json` | Machine-readable output |

## Scenarios

Each estimate includes:

- **Early-exit / no-op** — empty watchlist, minimal tokens
- **Full triage** — every run does a full scan
- **Action every run** — implementer + verifier every time (worst case)
- **Realistic blend** — level-based mix (documented in output)

Pair with `loop-budget.md` (scaffolded by `loop-init`) and `loop-audit` cost observability checks.

## Orchestration cost

The scenarios above assume one implementer pass. A loop that fans out to
multiple agents costs more on the **action path** (the no-op scan and single
triage pass are unaffected). `--orchestration` applies a multiplier so the
estimate — and the realistic per-run cap that feeds the circuit breaker —
reflects the real shape of the run:

| Mode | Multiplier | Models |
|------|-----------|--------|
| `single` (default) | 1x | One implementer pass, self-checked |
| `maker-checker` | 2x | Implementer + an independent verifier pass (the L2+ default) |
| `parallel:N` | N+1 | N candidate agents fan out, plus a merge/arbiter pass |
| `debate:R` | 1+R | One proposer plus R critique-and-revise rounds |

```bash
npx @cobusgreyling/loop-cost --pattern ci-sweeper --level L2 --orchestration maker-checker
npx @cobusgreyling/loop-cost --pattern ci-sweeper --level L2 --orchestration parallel:3
```

Multipliers above 2x emit a warning — deep fan-out or debate is easy to enable
and expensive to run unattended.

## Feed the circuit breaker

`--json` output resolves a realistic per-run token cap for
[`loop-context`](../loop-context)'s breaker, so `--token-budget` reflects real
pattern cost instead of a hand-typed guess (the `loop-guard` skill wires this):

```bash
BUDGET=$(npx @cobusgreyling/loop-cost --pattern ci-sweeper --level L2 --json \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d).scenarios.realistic.tokensPerRun)))')
npx @cobusgreyling/loop-context --check --ledger loop-ledger.json --token-budget "$BUDGET"
```

The tools stay independent — no runtime dependency, just shell wiring.

See [docs/operating-loops.md](../../docs/operating-loops.md).