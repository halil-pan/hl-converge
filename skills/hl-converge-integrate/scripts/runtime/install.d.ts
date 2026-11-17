export declare const agents: readonly ['claude-code', 'opencode', 'oh-my-pi', 'codex'];
export type Agent = typeof agents[number];
export declare function skillsRoot(agent: Agent, home: string, env: NodeJS.ProcessEnv): string;
export declare function install(selected: string[], options: {
    home?: string;
    skillsDir?: string;
    force: boolean;
}): unknown;
