import type { Repo, Run } from './types.js';
export declare function verify(repo: Repo, runId: string, confirmations: string[], rerun: boolean): Promise<Run>;
export declare function finish(repo: Repo, runId: string): Run;
