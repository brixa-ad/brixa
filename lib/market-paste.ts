/**
 * Reads a table of average prices pasted from a portal or Excel
 * ("Аспарухово 2,120 EUR/кв.м", "Аспарухово<TAB>2120", or name and price on two lines)
 * and finds each neighborhood in the town's list.
 */

type Hood = { id: string; name: string };

// Portals name a few neighborhoods differently from our list.
const ALIASES: Record<string, string> = {
  "гръцки квартал": "гръцка махала",
  "гръцки": "гръцка махала",
  "автогарата": "автогара",
  "западна пром зона": "западна промишлена зона",
  "погреби": "погребите",
  "окръжна болница генерали": "генералите",
};

/** "кв. Лятно кино - Тракия" → "лятно кино тракия" */
export function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    // "кв.", "ж.к.", "м.", "м-т" and the like in front of a name
    .replace(/(^|\s)(кв\.|ж\.\s?к\.|жк|м-т|м\.|к\.\s?к\.|гр\.|с\.)\s*/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const tokens = (name: string) => normalizeName(name).split(" ").filter(Boolean);

/** A price in the text: "2,120" "2 120" "2120.50" "1.918" — thousands separators or decimals. */
function readNumber(raw: string) {
  const clean = raw.replace(/[\s ]/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) return Number(clean.replace(/[.,]/g, ""));
  return Number(clean.replace(",", "."));
}

const NUMBER = /\d{1,3}(?:[\s .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

/** The price in a line: the number next to a currency, else the last number; and the text before it. */
function splitLine(line: string): { name: string; price: number } | null {
  const matches = [...line.matchAll(NUMBER)];
  if (matches.length === 0) return null;
  const withCurrency = matches.find((m) => /^\s*(€|eur|евро|лв)/i.test(line.slice(m.index! + m[0].length)));
  const chosen = withCurrency ?? matches[matches.length - 1];
  return { name: line.slice(0, chosen.index).replace(/[:\-–—|]+\s*$/, "").trim(), price: readNumber(chosen[0]) };
}

function findHood(name: string, hoods: Hood[]): Hood | null {
  const key = ALIASES[normalizeName(name)] ?? normalizeName(name);
  if (!key) return null;
  const exact = hoods.find((h) => normalizeName(h.name) === key);
  if (exact) return exact;

  // same words in any order, or one name inside the other ("Цветен" → "Цветен квартал", "Винс" → "ВИНС-Червен площад")
  const words = key.split(" ");
  let best: { hood: Hood; score: number } | null = null;
  for (const hood of hoods) {
    const theirs = tokens(hood.name);
    const inside = words.every((w) => theirs.includes(w)) || theirs.every((w) => words.includes(w));
    const shared = words.filter((w) => theirs.includes(w));
    if (!inside || !shared.some((w) => w.length >= 4)) continue;
    const score = shared.length / Math.max(words.length, theirs.length);
    if (!best || score > best.score) best = { hood, score };
  }
  return best?.hood ?? null;
}

export type PasteResult = {
  /** neighborhood id → price (several lines for one neighborhood are averaged) */
  prices: Map<string, number>;
  missed: string[];
};

export function parseMarketPaste(text: string, hoods: Hood[], range: { min: number; max: number }): PasteResult {
  const found = new Map<string, number[]>();
  const missed: string[] = [];
  let pendingName: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let entry = splitLine(line);

    // name on one line, price on the next
    if (entry && !entry.name && pendingName) entry = { name: pendingName, price: entry.price };
    if (!entry || !entry.name) {
      if (!entry) pendingName = line;
      continue;
    }
    pendingName = null;
    if (!(entry.price >= range.min && entry.price <= range.max)) continue;

    const hood = findHood(entry.name, hoods);
    if (!hood) {
      if (!missed.includes(entry.name)) missed.push(entry.name);
      continue;
    }
    found.set(hood.id, [...(found.get(hood.id) ?? []), entry.price]);
  }

  const prices = new Map<string, number>();
  for (const [id, list] of found) prices.set(id, Math.round(list.reduce((a, b) => a + b, 0) / list.length));
  return { prices, missed };
}
