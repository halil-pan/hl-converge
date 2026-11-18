export interface Repo {
    root: string;
    common: string;
    state: string;
}
export interface Worktree {
    path: string;
    head: string;
    branch: string | null;
    locked: boolean;
    bare: boolean;
}
export interface Check {
    name: string;
    command: string[];
    cwd: string;
    timeoutMs: number;
}
export interface Config {
    version: 1;
    defaultTarget?: string;
    checks: Check[];
    manualChecks: string[];
}
export type Owner = 'git' | 'claude-code' | 'opencode' | 'oh-my-pi' | 'codex' | 'unknown';
export interface Source {
    id: string;
    label: string;
    path: string;
    branch: string;
    commit: string;
    owner: Owner;
    released: boolean;
    updatedAt: string;
}
export interface Step {
    kind: 'source' | 'target';
    id: string;
    commit: string;
    status: 'pending' | 'merging' | 'conflict' | 'done';
    before?: string;
    after?: string;
}
export interface CheckResult {
    name: string;
    passed: boolean;
    exitCode: number | null;
    timedOut: boolean;
    durationMs: number;
    log: string;
}
export interface Verification {
    commit: string;
    checksHash: string;
    checks: CheckResult[];
    manualConfirmed: string[];
    passed: boolean;
    at: string;
}
export interface CleanupResult {
    id: string;
    path: string;
    status: 'removed' | 'already-removed' | 'blocked' | 'eligible';
    reason?: string;
    code?: string;
    details?: unknown;
    branchDeleted?: boolean;
}
export interface Run {
    version: 1;
    id: string;
    target: string;
    targetExpected: string;
    targetOrigin: 'explicit' | 'project-default';
    workspace: string;
    originalBranch: string | null;
    originalHead: string;
    branch: string;
    sources: Source[];
    steps: Step[];
    status: 'planned' | 'integrating' | 'conflict' | 'integrated' | 'verification-failed' | 'awaiting-manual' | 'verified' | 'finished' | 'cleaned';
    expectedHead?: string;
    verification?: Verification;
    finishIntent?: {
        commit: string;
        targetBefore: string;
    };
    finishedCommit?: string;
    cleanup?: CleanupResult[];
    createdAt: string;
    updatedAt: string;
    cleanupTarget?: {
        commit: string;
        rebased: boolean;
        checkpoint?: string;
    };
}
