/** Working days in Bulgaria: Monday–Friday minus the official holidays (Labour Code, art. 154). */

export const HOURS_PER_DAY = 8;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Orthodox Easter Sunday (Julian computus, moved to the Gregorian calendar). */
function orthodoxEaster(year: number) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return utc(year, month, day + 13);
}

const cache = new Map<number, Set<string>>();

/** Every day off in the year, including the weekday that replaces a holiday on a weekend. */
export function holidays(year: number) {
  const known = cache.get(year);
  if (known) return known;

  const fixed = [
    [1, 1], [3, 3], [5, 1], [5, 6], [5, 24], [9, 6], [9, 22], [12, 24], [12, 25], [12, 26],
  ].map(([m, d]) => utc(year, m, d));
  const easter = orthodoxEaster(year);
  const shift = (days: number) => new Date(easter.getTime() + days * 86_400_000);
  // Good Friday, Holy Saturday, Easter Sunday and Monday (never moved to another day)
  const easterDays = [shift(-2), shift(-1), easter, shift(1)];

  const off = new Set([...fixed, ...easterDays].map(iso));
  // A fixed holiday on a Saturday or Sunday → the next free weekday is off instead.
  for (const day of fixed) {
    if (!isWeekend(day)) continue;
    const next = new Date(day);
    do next.setUTCDate(next.getUTCDate() + 1);
    while (isWeekend(next) || off.has(iso(next)));
    off.add(iso(next));
  }
  cache.set(year, off);
  return off;
}

/** Working days from `from` to `to`, both included (YYYY-MM-DD). */
export function workingDays(from: string, to: string) {
  let count = 0;
  const day = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (day <= end) {
    if (!isWeekend(day) && !holidays(day.getUTCFullYear()).has(iso(day))) count++;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}
