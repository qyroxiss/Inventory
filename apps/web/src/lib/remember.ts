// "Remember me on this computer" — port of auth_page.dart:61-97. Stores the username only,
// never the password. MDA writes Data/auth_prefs.json; the web keeps the same JSON per browser.

const KEY = 'qi-auth-prefs';

/** The saved username, or null when nothing is remembered. */
export function loadRemembered(): string | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      remember?: boolean;
      username?: string;
    } | null;
    return data?.remember === true ? (data.username ?? 'admin') : null;
  } catch {
    return null;
  }
}

/** Called after a successful login: save the username, or forget it when unticked. */
export function saveRemembered(remember: boolean, username: string) {
  try {
    if (remember)
      localStorage.setItem(KEY, JSON.stringify({ remember: true, username: username.trim() }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: same as MDA's silent catch.
  }
}
