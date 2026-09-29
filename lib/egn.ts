/**
 * The Bulgarian personal number (ЕГН): YYMMDD + 3 digits + a check digit. The month carries the
 * century: 1–12 → 19xx, 21–32 → 18xx, 41–52 → 20xx.
 */
const WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6];

export function parseEgn(raw: string): { year: number; month: number; day: number } | null {
  const egn = raw.trim();
  if (!/^\d{10}$/.test(egn)) return null;
  const digits = egn.split("").map(Number);
  const sum = WEIGHTS.reduce((s, w, i) => s + w * digits[i], 0);
  if ((sum % 11) % 10 !== digits[9]) return null;

  const yy = Number(egn.slice(0, 2));
  let month = Number(egn.slice(2, 4));
  const day = Number(egn.slice(4, 6));
  let year = 1900 + yy;
  if (month > 40) {
    month -= 40;
    year = 2000 + yy;
  } else if (month > 20) {
    month -= 20;
    year = 1800 + yy;
  }
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > last) return null;
  return { year, month, day };
}

/** An ID card number: letters and digits, 5–20 (a Bulgarian card has 9 digits). */
export const isIdCard = (raw: string) => /^[A-Za-z0-9]{5,20}$/.test(raw.trim());

/** "••••••4567" — the last four only. */
export const masked = (value: string) => `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
