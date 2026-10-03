# Architecture decisions

One paragraph per real choice, as playbook §4.7 asks. Each entry is either **Decided** or **Proposed**. "Qyroxis Inventory" is only the internal working name; the product ships unbranded (D-17).

**Standing owner rule (2026-10-02):** port MDA's behaviour exactly, quirks included. Only the look, the platform and the branding change. A logic change happens only when the owner asks for it.

**D-01 — TypeScript monorepo, not a Flutter rewrite. (Decided 2026-10-02)**
MDA-Inventory is Flutter, and Flutter can build for web, desktop and mobile. We still move to TypeScript for three reasons:
- Qyroxis already has a standard web stack (React, Tailwind, shadcn, v0, self-hosted Node).
- Flutter web draws everything on a canvas. That gives a heavy first load and a poor browser feel for a product sold as a website.
- A web product needs a server, and in TypeScript one language covers both the server and the browser.

The cost is a one-time port of about 4,000 lines of services, schema and print code, plus the rules embedded in the pages, which LOGIC-SPEC captures. Golden tests exported from the Dart code control the risk.

**D-02 — One logic package (`@qi/core`), no IO. (Decided)**
All money, tax, numbering and validation rules live in a pure package. The browser imports it for live totals; the server imports it to recompute and persist. One implementation means the screen and the saved books can never disagree.

**D-03 — Postgres everywhere: cloud Postgres 16, desktop PGlite. (Decided 2026-10-02; PGlite passed the spike)**

**Spike result** (`tools/spike-pglite`, Windows 11 laptop, PGlite 0.5.8 on the filesystem, the same Drizzle code as the cloud build):
- **Speed:** 10,000 sale vouchers, each a full transaction with header, 4 ledger lines, 3 stock lines and the series update, took 37.4 s, which is **3.7 ms per sale**.
- **Reports:** ledger balances over 40,000 lines plus stock in hand for 300 items took 105 ms.
- **Correctness:** the books balanced (Dr − Cr = 0.00).
- **Size and durability:** 62.6 MB on disk, and all 10,000 vouchers were still there after closing and reopening.
- **Verdict:** a person keying a bill takes 30 s or more, so 3.7 ms per save is effectively instant. **Go.**
- The Postgres 16 comparison run is still pending, because Docker Desktop wasn't running. Run it with `PG_URL=… pnpm --filter @qi/spike-pglite spike`.

We considered Microsoft SQL Server and rejected it:
- Offline desktop would need SQL Server Express installed on every customer PC, and offline mobile would be impossible.
- It needs at least 2 GB RAM on the VPS.
- Its default case-insensitive collation would change MDA's case-sensitive duplicate checks (Q-15).
- MDA's SQLite queries port to Postgres almost unchanged.
- "SQL Server now, Postgres later" would mean building the database layer twice and migrating live data.


Self-hosted Postgres is already a playbook standing decision. Desktop runs PGlite, a version of Postgres that works as a single file-based database inside the app, with no separate install. That gives both products one schema, one migration history and one set of queries. If the spike shows PGlite is too slow or unreliable, the fallback is a portable Postgres bundled with the installer: the same code, but a bigger download. We rejected SQLite on desktop because it would mean two database dialects and two schemas to keep in step.

**D-04 — Hono for the API. (Decided)**
It is small and fast, suited to the 1–2 GB VPS. It runs on Node inside Electron without changes, and it has a typed RPC client, so the web app breaks at compile time when a route changes.

**D-05 — React + Vite SPA, not Next.js. (Decided)**
The same static bundle must run inside Electron and Capacitor with no server, and the app sits behind a login, so server rendering and SEO bring nothing.

**D-06 — Electron for desktop, not Tauri. (Decided)**
Electron has Node built in, so the API and PGlite run in-process with no sidecar binary. Silent printing and auto-update are both mature.

**D-07 — Capacitor for mobile; online-only in v1. (Decided)**
It reuses the same SPA.

**D-08 — Tenancy: account → company → financial year (book), in one database. (Decided)**
This replaces MDA's one-SQLite-file-per-company-per-year. Every book table carries `company_id` and `fy_id`, and a `BookContext` resolved per request does the scoping. **Users stay per book, as in MDA** (Q-03).

**D-09 — Split `Misc_Master` into typed tables; keep the business codes. (Decided)**
Units, godowns, stock groups, stock sub groups, sale types and cities each get their own table, and the codes (`GD001`, `UN019`, `SSG0001`, …) are kept exactly. The constraints copy MDA's, so delete behaviour is unchanged (Q-17). This is a storage detail and invisible to users.

**D-10 — UUID v7 surrogate keys + business codes. (Decided)**
They keep desktop↔cloud sync and data import possible without renumbering. Users still see and type the familiar codes.

**D-11 — Money as `numeric` in the database, Dart-identical double maths in code. (Decided)**
`round2` rounds halves away from zero, as Dart does, so every total matches MDA to the paisa.

**D-12 — MDA's numbering, unchanged. (Decided)**
The preview number is passed to save, and the unique constraint rejects a clash with MDA's own "already used" message (Q-08, Q-21). This is already safe with many users: a duplicate number is impossible, and the second person simply saves again.

**D-13 — Two login layers: account (better-auth) + book (MDA's login). (Decided)**
MDA shows the company list before login, which is fine on one PC but would expose every customer's companies on a website. Web and mobile therefore add an account login in front (better-auth, playbook standard). Behind it, MDA's company → year → username/password login runs exactly as before. Desktop skips the account layer.

**D-14 — Access rules as in MDA. (Decided 2026-10-02)**
The role matrix is displayed but not enforced, and Admin-only applies inside User Management (Q-12). There is no login lockout (Q-04). Book isolation between customer accounts is always enforced; that is platform security, not app logic.

**D-15 — `@react-pdf/renderer` for all printed documents. (Decided)**
It produces identical PDFs in the browser, Electron and Node.

**D-16 — Do not port the `Trvchr` table. (Decided)**
MDA writes a summary row there, but no screen or report ever reads it, so dropping it changes nothing a user can see. The importer reads it only to recover vouchers from before v10.

**D-17 — Unbranded until the build is complete. (Decided 2026-10-02)**
No product name, logo or "An MDA Softwares" footer appears anywhere. All product-facing branding comes from one file, `packages/core/src/brand.ts`, which is empty or neutral for now ("Inventory"). Branding goes in at the end by filling that file. Customers' own company details still print on their documents.

**D-18 — Desktop and cloud are separate products in v1. (Decided)**
There is no sync. Migration is one-way, through `tools/importer`.
