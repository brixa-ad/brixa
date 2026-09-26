/** Dates in the agency's time zone (Bulgaria). */
export const TIME_ZONE = "Europe/Sofia";

/** Today as YYYY-MM-DD in Sofia. */
export function sofiaToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Sofia calendar day an instant falls on. */
export function sofiaDay(iso: string) {
  return sofiaToday(new Date(iso));
}
