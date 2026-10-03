# apps/desktop

The Electron shell for the offline desktop product. It gets scaffolded in **Phase 7** (see `docs/WORKFLOW.md`).

How it will work:
- **Database:** PGlite at `%APPDATA%\<app>\data`.
- **API:** `@qi/api` runs in-process on `127.0.0.1:<random port>` with a per-launch token.
- **UI:** the window loads the `apps/web` build.
