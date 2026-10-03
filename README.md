# Qyroxis Inventory

The web, desktop (offline) and mobile rebuild of **MDA Inventory** (`../MDA-Inventory`). It keeps the same business logic and gets a new interface.

| Doc                                                                    | What it's for                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                           | Stack, monorepo layout, layers, tenancy, and how one codebase becomes three products                                                                                  |
| [docs/LOGIC-SPEC.md](docs/LOGIC-SPEC.md)                               | Every business rule ported from MDA-Inventory: GST maths, posting, numbering, masters, messages, keyboard behaviour, and the quirk register (everything ported as is) |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)                                   | Phased build plan (0–9) with gates, the per-feature loop, and dev rules                                                                                               |
| [docs/decisions.md](docs/decisions.md)                                 | Architecture decisions; the ones marked "Proposed" need sign-off                                                                                                      |
| [docs/design/AUTH-SCREENS.md](docs/design/AUTH-SCREENS.md)             | The approved login designs (S3, A6) and how to change them                                                                                                            |
| [docs/design/MASTERS-SCREENS.md](docs/design/MASTERS-SCREENS.md)       | The approved New Company and Manage Years designs (M1, M2)                                                                                                            |
| [docs/design/MAIN-SCREEN.md](docs/design/MAIN-SCREEN.md)               | The approved main screen design (D1 · Ledger Desk)                                                                                                                    |
| [docs/design/ACCOUNTING-MASTERS.md](docs/design/ACCOUNTING-MASTERS.md) | Group Master and Sub Group Master, built directly from spec, and the Q-16/Q-18 quirks                                                                                 |

**Status:** Phase 0 done. All login screens are built from the approved designs:

- account sign-in (S3, web only)
- Company & Year Setup with the book login (A6)
- the forced password change
- New Company (M1) and Manage Years (M2)
- the main screen (D1 · Ledger Desk): sidebar, section pages, Quick find and a one-screen dashboard. Its figures show no activity until the stock, sales and voucher parts are built.
- Masters › Accounting Masters › **Group Master** and **Sub Group Master**, including the default 28-group seed every new book gets

## Run it locally

Use two terminals from this folder (PowerShell). Node 22+ and pnpm are needed; no database install is needed.

```powershell
# 1. API on http://localhost:3000, data kept in .data/pglite
pnpm --filter @qi/api dev

# 2. Web app on http://localhost:5173
pnpm --filter @qi/web dev
```

Open http://localhost:5173. You'll see the account sign-in screen, as on the website.

**Test logins:**

- **Account:** sign in with **demo@example.com / password1**, which has 16 sample companies, or create a new account.
- **Books:** every new financial year starts with **admin / admin**, and the first login asks for a new password (as in MDA).

**To work as the desktop app does** (no account sign-in, account `local`): start the API with `$env:LOCAL_ACCOUNT='1'; pnpm --filter @qi/api dev`. This is for local development only; the server refuses it when `DATABASE_URL` is set.

## Share a review link (temporary)

This gives someone outside your computer a public `https://….trycloudflare.com` link to the app. It works only while these three windows stay open and the computer stays on, and the address changes every time.

```powershell
# 1. Build the app and serve the build on port 4173
pnpm --filter @qi/web build
cd apps/web; pnpm exec vite preview

# 2. In a second window: open the tunnel and note the https://….trycloudflare.com address it prints
cloudflared tunnel --no-autoupdate --url http://localhost:4173

# 3. In a third window, from this folder: start the API with that address allowed and a random secret
$env:TRUSTED_ORIGINS = 'http://localhost:5173,http://localhost:4173,https://PASTE-THE-ADDRESS.trycloudflare.com'
$env:APP_SECRET = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"
pnpm --filter @qi/api dev
```

Anyone with the link can open the app and create an account, so share it only with people you trust. The data is your local test data.
