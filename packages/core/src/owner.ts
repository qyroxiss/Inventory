// Owner Panel (added 2026-11-13, at the user's request): the software's owner creates the
// customer accounts, resets their passwords, blocks them and sets how long they work. Public
// sign-up is closed; only an owner email (OWNER_EMAILS on the server) may sign itself up.

export const ownerMessages = {
  blocked: 'This account is blocked. Please contact your software provider.',
  expired: (dmy: string) =>
    `This account expired on ${dmy}. Please contact your software provider to renew it.`,
  signUpClosed: 'New accounts are created by your software provider.',
  notOwner: 'Only the software owner can open this page.',
  emailTaken: 'An account with this email already exists.',
  ownerLocked: "The owner's own account can't be blocked or given an end date.",
  notFound: 'Account not found.',
};

export type AccountStatus = 'active' | 'blocked' | 'expired';

/** Blocked wins; else expired once today is past the valid-till day; else active. */
export function accountStatus(
  a: { blocked: boolean; validTill: string | null },
  today: string,
): AccountStatus {
  if (a.blocked) return 'blocked';
  if (a.validTill && today > a.validTill) return 'expired';
  return 'active';
}

/** Owner emails from a comma-separated setting, trimmed and lower-cased. */
export const parseOwnerEmails = (raw: string | undefined) =>
  (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Today in India (yyyy-MM-dd), whatever the server's own time zone. */
export const indiaToday = (now = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** yyyy-MM-dd → dd-MM-yyyy. */
export const isoToDmy = (iso: string) => iso.split('-').reverse().join('-');
