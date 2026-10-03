// Book login rules, ported from MDA-Inventory lib/auth_page.dart. Messages are verbatim.

export const loginMessages = {
  required: 'Required',
  invalid: 'Invalid username or password',
  failed: 'Login failed. Please try again.',
  changeRequired: 'Password change is required to continue.',
  // Forced password change dialog (auth_page.dart:117-161)
  changeTitle: 'Set a new password',
  changePrompt: (userName: string) =>
    `"${userName}" is still using the default password. Choose a new one to continue.`,
  tooShort: 'Use at least 6 characters',
  notAdmin: 'Choose a different password',
  mismatch: 'Passwords do not match',
};

/** Username is trimmed before the check; the password is not (auth_page.dart:284-298). */
export function loginFieldErrors(input: { username?: string; password?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.username ?? '').trim()) errors.username = loginMessages.required;
  if (!(input.password ?? '')) errors.password = loginMessages.required;
  return errors;
}

/** The forced-change rules: at least 6 characters, not 'admin', confirmation must match. */
export function newPasswordErrors(input: { newPassword?: string; confirmPassword?: string }) {
  const errors: Record<string, string> = {};
  const pw = input.newPassword ?? '';
  if (pw.length < 6) errors.newPassword = loginMessages.tooShort;
  else if (pw === 'admin') errors.newPassword = loginMessages.notAdmin;
  if ((input.confirmPassword ?? '') !== pw) errors.confirmPassword = loginMessages.mismatch;
  return errors;
}

/** The user seeded into every new book (db_service.dart:1187-1193). */
export const SEED_ADMIN = {
  userCode: 'ADMIN001',
  userName: 'admin',
  password: 'admin',
  role: 'Admin',
  isActive: true,
  mustChangePassword: true,
} as const;

/** Role names offered in User Management (user_management_page.dart:22). */
export const ROLES = ['Admin', 'Manager', 'Operator', 'Viewer'] as const;
