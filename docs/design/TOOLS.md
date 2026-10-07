# Tools

**Status:** built 2026-10-07.

- **User Management** is ported from `user_management_page.dart`.
- MDA shows "Not built yet" for **Backup Data**, **Company Settings**, **Import Data** and
  **Logs**. They're built here and described below.
- **Code:**
  - `packages/core/src/tools.ts`: wording, checks and the permission grid.
  - `packages/services/src/tools.ts`: users, numbering and logs.
  - `packages/services/src/backup.ts`: backup and restore.
  - `apps/web/src/screens/tools/`: the screens.
- **Addresses:** each menu item's own: `/app/backup-data`, `/app/user-management`,
  `/app/company-settings`, `/app/import-data`, `/app/logs`.
- **The menu:** with Tools done, no menu item says "Not built yet" any more.

## User Management (MDA's)

- **Layout:** USERS list (User Name · Role · Active) on the left and the NEW USER / EDIT USER
  form on the right. The ROLE PERMISSIONS grid sits below.
- **Form:**
  - User Name *, Password * (New Password on edit: "Leave blank to keep current"), Confirm
    Password * (new only), Role, Active.
  - Buttons: Cancel · Save User, or Cancel · Delete · Update User.
- **Rules:**
  - Only an Admin can save, update or delete: "Only an Admin user can manage users".
  - The password is at least 4 characters ("Min 4 characters") and must match ("Passwords do
    not match"). It's stored hashed.
  - A new user's role starts as "User", which isn't in the list (Q-02). The grid is shown only;
    nothing enforces it (Q-12).
  - A blank password on update keeps the current one. A new password clears "must change
    password".
  - Delete asks "Delete user "x"? This cannot be undone.". It's refused for yourself ("Cannot
    delete the currently logged-in user") and for the last active Admin ("Cannot delete the only
    Admin user").
  - A duplicate name on Save: "User "x" already exists".
  - Every change is written to the log.
- **Q-54:** Update checks neither the last Admin nor duplicates beyond the database's own: an
  Admin can demote or deactivate themselves.

## Company Settings

- **Company Details:** the open company in Company Creation's own form and checks (Name
  required; GSTIN and PAN checked when entered).
  - Only **Update Company** is offered; there's no Delete or New here.
  - The open book picks up the new name and GST state straight away, so GST works from the new
    GSTIN without signing out.
- **Voucher Numbering:**
  - Every series (Cash Receipt RCP-, …, Purchase Bill No PB-, Sale Bill No SB-) with its Prefix,
    Digits and the **Next No.** it will give.
  - Prefix: letters, digits, `-` or `/`, up to 8, upper-cased. Digits: 1–8.
  - A change applies from the next number; numbers already used keep their form.
- **Who can change it:** only an Admin, for both tabs ("Only an Admin user can change company
  settings"). Changes are logged.

## Backup Data

- **Download Backup** saves the whole open company as one `.json` file: every financial year,
  with users, groups, ledgers, masters, vouchers, bills, stock and the log.
- The screen then lists what each year holds.
- The file contains the users' password hashes, never the passwords themselves.

## Import Data

- **From MDA Inventory:** the same import as on Company & Year Setup.
- **From a backup file:**
  - The company comes back with every year. Each record gets a new id, and the links between
    records are kept.
  - As with the MDA import, a company whose code is already in the account is left alone: ""x"
    is already in this account, so nothing was restored. Delete it first, or restore into
    another account."
  - A file that isn't a backup: "This file is not an Inventory backup."
- Restored companies appear on Company & Year Setup.
- **Live-site limit:** Vercel caps a request at about 4.5 MB, so a very large backup may need to
  be restored on the desktop or self-hosted app.

## Logs

- The audit log, newest first: When · User · Action · Record · Details.
- **Filters:** From / To (inside the year, days in India time), User, Action, and a Details
  switch.
- **What's logged:** every save, update, cancel and delete of vouchers, bills, journals, users
  and numbering, plus entries brought in by an MDA import.

## Checked

- **Service tests** (`packages/services/test/tools.test.ts`):
  - Users: Admin only, the form rules, a password change working at login, delete refusals and
    logging.
  - Numbering: the next number under a new prefix and digits, and the Admin check.
  - Backup: a full round trip. Back up, delete the company, restore, then sign in to the
    restored year and find the purchase, its lines and its stock intact.
- **Browser:** every screen and flow, including the backup download and both restore refusals.
- **Layout:** no page scroll at 1280×720 or 768×1024. On phones, User Management and Company
  Settings scroll, as allowed.
