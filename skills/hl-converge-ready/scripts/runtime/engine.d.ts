import type { Repo, Source, Owner, Run } from './types.js';
export declare function ready(repo: Repo, name: string, label: string | undefined, owner: Owner, released: boolean, createBranch?: string): Source;
export declare function plan(repo: Repo, names: string[], workspace: string, target?: string): Run;
export declare function candidate(repo: Repo, r: Run): void;
export declare function integrate(repo: Repo, runId: string): Run;
export declare function refresh(repo: Repo, runId: string): Run;
export declare function inventory(repo: Repo): unknown;
