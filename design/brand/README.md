# Logo — prepared, not in use

**Status:** designed on 2026-10-03, at the owner's request, for later use. The app stays
**unbranded** until the owner says otherwise — nothing here is wired into the site or build.
This is just the asset, ready for when that changes.

It matches the favicon exactly: same mark, same colours, nothing invented beyond that.

|          |                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mark     | the favicon's ledger-ink stroke + red tally square ([../../apps/web/public/favicon.svg](../../apps/web/public/favicon.svg))                                |
| Wordmark | "Inven*tory.*" — Instrument Serif, second half italic, as already built on the account sign-in screen                                                      |
| Colours  | green `#0c5c3c` (the app's `--primary`), cream `#fbf9f3` (`--card`), red `#c4503c` (`--ledger-margin`), ink `#1c1b18` / `#ece8de` for the two text colours |

## Files

- `logo-horizontal-light.png` — mark + wordmark, side by side, for a cream/white background
- `logo-horizontal-dark.png` — the same, for a dark background
- `logo-horizontal-transparent.png` — the light version with no background fill, to place on anything
- `logo-stacked-light.png` — mark above wordmark, for a square space (social preview, a splash screen)

All are @2x (crisp at normal display size, scale down as needed). The name "Inventory" is still a
placeholder, same as the rest of the app; when the product gets its real name, only the wordmark
changes — the mark stays.

## If this needs to be rebuilt or resized

The wordmark is plain Instrument Serif at 96px (horizontal) or 56px (stacked), 0.85 line height,
-0.01em tracking, second half (after splitting the name in the middle) in italic with a trailing
period — exactly `Wordmark()` in
[apps/web/src/screens/AccountScreen.tsx](../../apps/web/src/screens/AccountScreen.tsx). There's no
separate source file for the lockup; regenerate it from the favicon SVG and that same component's
styling if a different size or format is needed.
