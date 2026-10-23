/**
 * One human sentence from a validation/domain error.
 *
 * Zod errors stringify as JSON (`[{"code":"too_big",...}]`), which must never
 * reach the UI. Used by the process sheet and the capture sheet so both behave
 * the same way.
 */
export function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    const first = issues?.find((issue) => typeof issue.message === 'string' && issue.message !== '');
    if (first?.message) return first.message;
  }
  return error instanceof Error ? error.message : String(error);
}
