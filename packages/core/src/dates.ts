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

/** 'YYYY-MM-DD' → 'dd-MM-yyyy', the one date format shown and printed across the software
 *  (the user's choice, 2026-10-25). */
export const formatDmy = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};

/**
 * A date as typed into a date box, for fast entry (added 2026-10-25): `25-10-2026`, `25/10/26`,
 * `25.10.2026`, `25-10` (the year that puts it inside [from, to], else this year), or digits only
 * (`2510`, `251026`, `25102026`). Returns 'YYYY-MM-DD', or null when it isn't a real date —
 * 31-02 is refused here, it doesn't roll over. The caller checks the range.
 */
export function readTypedDate(
  raw: string,
  from?: string | null,
  to?: string | null,
  today: Date = new Date(),
): string | null {
  const t = raw.trim();
  let d: number, m: number, y: number | null;
  const digits = /^\d+$/.test(t);
  if (digits && [4, 6, 8].includes(t.length)) {
    d = Number(t.slice(0, 2));
    m = Number(t.slice(2, 4));
    y = t.length === 4 ? null : Number(t.slice(4));
  } else {
    const parts = t.split(/[\s/\-.]+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 3 || !parts.every((x) => /^\d+$/.test(x))) return null;
    d = Number(parts[0]);
    m = Number(parts[1]);
    y = parts.length === 3 ? Number(parts[2]) : null;
  }
  if (y !== null && y < 100) y += 2000;
  const real = (yy: number) => {
    if (m < 1 || m > 12 || d < 1 || yy < 1900 || yy > 9999) return null;
    const iso = `${pad(yy, 4)}-${pad(m)}-${pad(d)}`;
    return normalise(yy, m, d) === iso ? iso : null;
  };
  if (y !== null) return real(y);
  // No year typed: the one that lands inside the open year, else this calendar year.
  const years = [from, to].filter((x): x is string => !!x).map((x) => Number(x.slice(0, 4)));
  for (const yy of years) {
    const iso = real(yy);
    if (iso && isInFinancialYear(iso, from ?? null, to ?? null)) return iso;
  }
  return real(today.getFullYear());
}

/** True when [date] falls inside the open year; true when the range is unknown (MDA rule). */
export function isInFinancialYear(date: string, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  return date >= from && date <= to; // ISO dates compare correctly as strings
}

/** '2026-2027 (01/04/2026 to 31/03/2027)', or just the year name when the range is unknown. */
export const financialYearLabel = (year: string, from: string | null, to: string | null): string =>
  !from || !to ? year : `${year} (${formatDmy(from)} to ${formatDmy(to)})`;
