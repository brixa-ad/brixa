/**
 * Reads a table of average prices pasted from a portal or Excel and finds each neighborhood in
 * the town's list. Understands:
 *   "Аспарухово 2,120 EUR/кв.м" · "Аспарухово<TAB>2120" · the name on one line and the price on the next
 *   · imot.bg's table: the name, then price and €/m² for one-, two- and three-room flats and the
 *     "Общо" €/m² last ("-" where there are none)
 * From several numbers for one neighborhood it takes the one next to a currency, else the last one
 * that looks like a price per m² (the "Общо" column).
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
  "суха река": "сухата река",
  "бели брези": "белите брези",
  "лев толстой": "толстой",
  "стар град": "старият град",
  "стария град": "старият град",
  "владислав варненчик": "владиславово",
  "владислав варненчик 1": "владиславово",
  "владислав варненчик 2": "владиславово",
  "свети никола": "св никола",
  "горна трака": "траката",
  "долна трака": "траката",
};

/** "кв. Лятно кино - Тракия" → "лятно кино тракия" */
export function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    // "кв.", "ж.к.", "м.", "м-т" and the like in front of a name
    .replace(/(^|\s)(кв\.|ж\.\s?к\.|жк|м-т|м\.|к\.\s?к\.|в\.\s?з\.|гр\.|с\.)\s*/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const tokens = (name: string) => normalizeName(name).split(" ").filter(Boolean);

/** A price in the text: "2,120" "2 120" "2120.50" "1.918" — thousands separators or decimals. */
function readNumber(raw: string) {
  const clean = raw.replace(/[\s ]/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) return Number(clean.replace(/[.,]/g, ""));
  return Number(clean.replace(",", "."));
}

const NUMBER = /\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
// the units around a price, so a line of numbers isn't taken for a name
const UNITS = /€|eur|евро|лв\.?|bgn|кв\.?\s*м\.?|м2|м²|sq\.?\s*m|цена|price|%/giu;
const CURRENCY_AFTER = /^\s*(€|eur|евро|лв)/i;

type Found = { value: number; currency: boolean };

function numbersIn(text: string): Found[] {
  return [...text.matchAll(NUMBER)].map((m) => ({
    value: readNumber(m[0]),
    currency: CURRENCY_AFTER.test(text.slice(m.index! + m[0].length)),
  }));
}

/** A line with a name: the name, and any numbers on the same line. */
function nameLine(line: string): { name: string; numbers: Found[] } {
  const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
  if (cells.length > 1) return { name: cells[0], numbers: numbersIn(cells.slice(1).join("\t")) };

  // one cell: "Аспарухово 2,120 EUR/кв.м" or "Аспарухово 2120" — but "Възраждане 1" is just a name
  const all = [...line.matchAll(NUMBER)];
  const priced = all.find((m) => CURRENCY_AFTER.test(line.slice(m.index! + m[0].length)));
  const last = all[all.length - 1];
  const chosen = priced ?? (last && readNumber(last[0]) >= 100 && line.slice(last.index! + last[0].length).trim() === "" ? last : null);
  if (!chosen) return { name: line, numbers: [] };
  return {
    name: line.slice(0, chosen.index).replace(/[:\-–—|]+\s*$/, "").trim(),
    numbers: [{ value: readNumber(chosen[0]), currency: Boolean(priced) }],
  };
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
    // "Възраждане 1" is not "Възраждане 2"
    const numbers = (list: string[]) => list.filter((w) => /^\d+$/.test(w)).join();
    if (numbers(words) !== numbers(theirs) && numbers(words) && numbers(theirs)) continue;
    const score = shared.length / Math.max(words.length, theirs.length);
    if (!best || score > best.score) best = { hood, score };
  }
  return best?.hood ?? null;
}

export type PasteResult = {
  /** neighborhood id → price (several rows for one neighborhood are averaged) */
  prices: Map<string, number>;
  missed: string[];
};

export function parseMarketPaste(text: string, hoods: Hood[], range: { min: number; max: number }): PasteResult {
  // each name with the numbers under it (until the next name)
  const blocks: { name: string; numbers: Found[] }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/\p{L}/u.test(line.replace(UNITS, " "))) blocks.push(nameLine(line));
    else blocks[blocks.length - 1]?.numbers.push(...numbersIn(line));
  }

  // several rows for one neighborhood: the one named just like it wins ("Чайка" over "к.к. Чайка"), else the average
  const found = new Map<string, { price: number; exact: boolean }[]>();
  const missed: string[] = [];
  for (const block of blocks) {
    const fits = block.numbers.filter((n) => n.value >= range.min && n.value <= range.max);
    const price = (fits.find((n) => n.currency) ?? fits[fits.length - 1])?.value;
    if (price === undefined || !block.name) continue;
    const hood = findHood(block.name, hoods);
    if (!hood) {
      if (!missed.includes(block.name)) missed.push(block.name);
      continue;
    }
    const exact = block.name.trim().toLowerCase() === hood.name.trim().toLowerCase();
    found.set(hood.id, [...(found.get(hood.id) ?? []), { price, exact }]);
  }

  const prices = new Map<string, number>();
  for (const [id, rows] of found) {
    const list = (rows.some((r) => r.exact) ? rows.filter((r) => r.exact) : rows).map((r) => r.price);
    prices.set(id, Math.round(list.reduce((a, b) => a + b, 0) / list.length));
  }
  return { prices, missed };
}
