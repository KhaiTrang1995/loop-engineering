export type BudgetScenario = 'realistic' | 'action' | 'report';
export declare const VALID_BUDGET_SCENARIOS: BudgetScenario[];
export declare function assertValidBudgetScenario(scenario: string): asserts scenario is BudgetScenario;
export interface BudgetFromPatternInput {
    pattern: string;
    level?: string;
    scenario?: BudgetScenario;
    cadence?: string;
    conservative?: boolean;
}
/** Locate loop-cost's built CLI: monorepo sibling first, then an installed dependency. */
export declare function resolveCostCli(): Promise<string | null>;
/**
 * Resolve a token budget from loop-cost's realistic per-pattern estimate
 * instead of a hand-typed number. Shells out to loop-cost's built CLI
 * (same monorepo-then-installed-dependency resolution loop-init uses for
 * loop-audit) so the two tools stay independent at the source level.
 */
export declare function resolveTokenBudgetFromPattern(input: BudgetFromPatternInput): Promise<number>;
