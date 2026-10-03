// Dates are handled as ISO calendar dates ('YYYY-MM-DD'), the same value Postgres `date`
// columns hold. Port of DbService.parseDate / isInFinancialYear / financialYearLabel
// (MDA-Inventory lib/db_service.dart:29-60).

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Dart `DateTime(y, m, d)`: out-of-range parts roll over (31/02 → 03/03). */
function normalise(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const ISO = /^(\d{4})-?(\d{2})-?(\d{2})(?:[T ].*)?$/;

/**
 * Accepts ISO `yyyy-MM-dd` (optionally with a time) and `d/M/y` with `/`, `-` or `.`
 * separators; a 2-digit year means 20yy. Returns 'YYYY-MM-DD' or null.
 */
export function parseDate(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const iso = ISO.exec(v);
  if (iso) return normalise(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = v.split(/[/\-.]/);
  if (parts.length === 3) {
    const [d, m, y] = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      return normalise(y! < 100 ? 2000 + y! : y!, m!, d!);
    }
  }
  return null;
}

/** 'YYYY-MM-DD' → 'dd/MM/yyyy', the format MDA shows everywhere. */
export const formatDmy = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** True when [date] falls inside the open year; true when the range is unknown (MDA rule). */
export function isInFinancialYear(date: string, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  return date >= from && date <= to; // ISO dates compare correctly as strings
}

/** '2026-2027 (01/04/2026 to 31/03/2027)', or just the year name when the range is unknown. */
export const financialYearLabel = (year: string, from: string | null, to: string | null): string =>
  !from || !to ? year : `${year} (${formatDmy(from)} to ${formatDmy(to)})`;
