export class FlowError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'FlowError';
    }
}
export function ensure(condition, code, message, details) {
    if (!condition)
        throw new FlowError(code, message, details);
}
export const now = () => new Date().toISOString();
