// Company preferences set by an Admin in Tools › Company Settings (added 2026-11-09):
//   - Item Entry: which of Item Name / Item Code comes first on Purchase and Sales, in the entry
//     boxes and in the grid.
//   - Print Layout: paper size and orientation, used by every print in the software.
// The main shell loads them before any book screen draws (`setPreferences`), as with decimals.

export type Preferences = {
  itemEntry: 'name' | 'code';
  paperSize: 'A4' | 'A5' | 'Letter' | 'Legal';
  paperOrientation: 'portrait' | 'landscape';
};

let prefs: Preferences = { itemEntry: 'name', paperSize: 'A4', paperOrientation: 'portrait' };

export const preferences = (): Preferences => prefs;

export function setPreferences(p: Preferences) {
  prefs = p;
  applyPageLayout(p);
}

/** Paper sizes in mm (portrait). */
const PAPER_MM: Record<Preferences['paperSize'], [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [216, 279],
  Legal: [216, 356],
};

/** The printed margin on every side, in mm. */
export const PAGE_MARGIN_MM = 10;

/** The chosen paper's width and height in mm, turned for landscape. */
export function paperMm(p: Preferences = prefs): [number, number] {
  const [w, h] = PAPER_MM[p.paperSize] ?? PAPER_MM.A4;
  return p.paperOrientation === 'landscape' ? [h, w] : [w, h];
}

/** One `@page` rule for the whole app, so every print (window.print) uses the chosen paper. */
function applyPageLayout(p: Preferences) {
  if (typeof document === 'undefined') return;
  let tag = document.getElementById('page-layout') as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'page-layout';
    document.head.appendChild(tag);
  }
  tag.textContent = `@page { size: ${p.paperSize} ${p.paperOrientation}; margin: ${PAGE_MARGIN_MM}mm; }`;
}
