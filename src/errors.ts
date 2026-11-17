export class FlowError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = 'FlowError'; }
}
export function ensure(condition: unknown, code: string, message: string, details?: unknown): asserts condition {
  if (!condition) throw new FlowError(code, message, details);
}
export const now = () => new Date().toISOString();
