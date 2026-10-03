/**
 * A failure whose message is safe to show the user as is, like MDA's PostingException.
 * `fieldErrors` carries per-field form messages (field name → message).
 */
export class UserError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'UserError';
  }
}

/** Throws when a form has field errors; the first message doubles as the summary. */
export function assertNoFieldErrors(errors: Record<string, string>): void {
  const first = Object.values(errors)[0];
  if (first) throw new UserError(first, errors);
}
