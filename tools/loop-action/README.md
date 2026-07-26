# Loop Engineering Action

An official GitHub Composite Action to safely execute autonomous agents in your CI/CD pipelines.

Instead of writing complex bash scripts to enforce circuit breakers, run readiness audits, and isolate agent execution in worktrees, this action wraps the entire [Loop Engineering](https://github.com/cobusgreyling/loop-engineering) safety suite into a single, elegant step.

## Usage

```yaml
- uses: cobusgreyling/loop-engineering/tools/loop-action@main
  with:
    pattern: 'ci-sweeper'
    command: 'npx grok-cli run --skill .grok/skills/ci-sweeper/SKILL.md'
    level: 'L2'
    sandbox: 'true'
    sandbox-shell: 'false'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pattern` | **Yes** | | The loop pattern you are running (e.g., `ci-sweeper`, `daily-triage`). Must match a pattern in `loop-budget.md`. |
| `command` | **Yes** | | The actual terminal command to invoke your agent (e.g., `claude`, `grok`, `aider`). |
| `level` | No | `L1` | The autonomy level for budget constraint verification (`L1`, `L2`, `L3`). |
| `sandbox` | No | `false` | If `'true'`, routes the execution through `loop-sandbox` to provide ephemeral worktree isolation, capturing changes securely without destroying the main working tree. |
| `sandbox-shell` | No | `false` | If `'true'`, routes the execution inside a shell environment (`--shell`). |

## What it does under the hood

When this action runs, it sequentially executes:
1. **`loop-audit`**: Checks the repository against the Loop Readiness rubric (ensuring `STATE.md`, `gate.yaml`, and constraints are in place).
2. **`loop-context`**: Acts as a circuit breaker. It halts the workflow immediately if the loop is stuck in a failure cycle or has exhausted its daily token budget.
3. **Execution (`loop-sandbox`)**: If `sandbox: 'true'`, it dynamically isolates the agent inside an ephemeral git worktree, tracks all modifications into a patch file, and cleans up. Otherwise, it executes the command directly in the main tree.
