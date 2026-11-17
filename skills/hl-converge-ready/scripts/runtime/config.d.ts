import type { Config, Repo } from './types.js';
export declare function validationSettings(input: unknown): Pick<Config, 'checks' | 'manualChecks'>;
export declare function setConfig(repo: Repo, key: string, value: string): Config;
