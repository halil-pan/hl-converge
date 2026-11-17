export declare class FlowError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown);
}
export declare function ensure(condition: unknown, code: string, message: string, details?: unknown): asserts condition;
export declare const now: () => string;
