export interface SandboxOptions {
    shell?: boolean;
    base?: string;
}
export interface SandboxResult {
    runId: string;
    patchFile: string | null;
    exitCode: number | null;
    hasChanges: boolean;
}
/**
 * Wraps an agent command in a temporary git worktree sandbox.
 * Returns the patch file path if changes were made.
 */
export declare function runInSandbox(root: string, command: string, args: string[], options?: SandboxOptions): Promise<SandboxResult>;
export interface ReviewItem {
    patchName: string;
    patchPath: string;
    size: number;
}
/** Lists all available patches in the .loop-sandbox/patches/ directory. */
export declare function listPatches(root: string): Promise<ReviewItem[]>;
