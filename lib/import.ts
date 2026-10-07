// Bringing clients and listings in from a table: reading CSV and phone contacts (.vcf),
// finding which column is which, and turning each row into what the database takes.
// (Excel .xlsx is read with read-excel-file in the browser.)

export type Table = { headers: string[]; rows: string[][] };
export type ImportKind = "clients" | "properties";

/** A cell as text: dates as 2026-10-07, numbers as they are. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** The first non-empty row is the header; empty rows are left out. */
export function toTable(raw: unknown[][]): Table {
  const rows = raw.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ""));
  const [headers = [], ...rest] = rows;
  const width = Math.max(headers.length, ...rest.map((r) => r.length), 0);
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  return { headers: pad(headers).map((h, i) => h || `${i + 1}`), rows: rest.map(pad) };
}

/** CSV / TSV: the separator is guessed from the first line (; , or tab); quotes are honoured. */
export function parseCsv(text: string): unknown[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") >= 0 ? clean.indexOf("\n") : undefined);
  const sep = ["\t", ";", ","].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "=D0=98=D0=B2=D0=B0=D0=BD" → "Иван" (vCards from Android). */
function quotedPrintable(value: string) {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(value[i]));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The phone's contacts (.vcf): name, phone(s), e-mail, note. */
export function parseVcf(text: string): unknown[][] {
  // folded lines: a line starting with a space continues the one before; "=" at the end, too (quoted-printable)
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/=\n/g, "")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  const rows: unknown[][] = [["Име", "Телефон", "Имейл", "Бележка"]];
  let card: { name: string; phones: string[]; email: string; note: string; org: string } | null = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).toUpperCase();
    let value = line.slice(colon + 1).trim();
    if (key.includes("QUOTED-PRINTABLE")) value = quotedPrintable(value);
    value = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ");
    const field = key.split(";")[0];
    if (field === "BEGIN") card = { name: "", phones: [], email: "", note: "", org: "" };
    else if (!card) continue;
    else if (field === "FN") card.name = value;
    else if (field === "N" && !card.name) card.name = value.split(";").slice(0, 2).reverse().filter(Boolean).join(" ");
    else if (field === "TEL") card.phones.push(value);
    else if (field === "EMAIL" && !card.email) card.email = value;
    else if (field === "NOTE") card.note = value;
    else if (field === "ORG") card.org = value.replace(/;/g, " ").trim();
    else if (field === "END") {
      const extra = [card.phones.slice(1).join(", "), card.org, card.note].filter(Boolean).join(" · ");
      if (card.name || card.phones.length) rows.push([card.name || card.phones[0], card.phones[0] ?? "", card.email, extra]);
      card = null;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Which column is which

export type FieldKey =
  | "full_name"
  | "last_name"
  | "phone"
  | "email"
  | "types"
  | "client_class"
  | "notes"
  | "broker"
  | "subtype"
  | "operation"
  | "title"
  | "price"
  | "currency"
  | "area"
  | "rooms"
  | "floor"
  | "total_floors"
  | "town"
  | "neighborhood"
  | "address"
  | "description"
  | "exclusive"
  | "owner_name"
  | "owner_phone";

/** The fields of each kind, with the column names they're usually given (Bulgarian and English). */
export const FIELDS: Record<ImportKind, { key: FieldKey; words: string[] }[]> = {
  clients: [
    { key: "full_name", words: ["име и фамилия", "имена", "име", "клиент", "контакт", "name", "full name", "first name"] },
    { key: "last_name", words: ["фамилия", "презиме и фамилия", "last name", "surname"] },
    { key: "phone", words: ["телефон", "тел", "gsm", "мобилен", "мобилен телефон", "phone", "mobile", "tel"] },
    { key: "email", words: ["имейл", "email", "e-mail", "ел поща", "поща", "mail"] },
    { key: "types", words: ["вид клиент", "вид", "тип", "роля", "категория", "type", "role"] },
    { key: "client_class", words: ["клас", "class", "рейтинг", "приоритет"] },
    { key: "notes", words: ["бележка", "бележки", "коментар", "коментари", "търси", "notes", "note", "comment"] },
    { key: "broker", words: ["брокер", "агент", "отговорник", "отговорен брокер", "broker", "agent", "owner"] },
  ],
  properties: [
    { key: "subtype", words: ["вид имот", "тип имот", "вид", "тип", "имот", "type", "property type"] },
    { key: "operation", words: ["операция", "сделка", "продажба наем", "предлагане", "operation", "deal type"] },
    { key: "title", words: ["заглавие", "обява", "title", "name"] },
    { key: "price", words: ["цена", "продажна цена", "наем", "price"] },
    { key: "currency", words: ["валута", "currency"] },
    { key: "area", words: ["площ", "квадратура", "кв м", "м2", "застроена площ", "area", "size", "sqm"] },
    { key: "rooms", words: ["стаи", "брой стаи", "rooms"] },
    { key: "floor", words: ["етаж", "floor"] },
    { key: "total_floors", words: ["етажност", "етажи", "общо етажи", "total floors", "floors"] },
    { key: "town", words: ["град", "населено място", "нас място", "city", "town"] },
    { key: "neighborhood", words: ["квартал", "район", "кв", "neighborhood", "neighbourhood", "district", "area name"] },
    { key: "address", words: ["адрес", "улица", "address", "street"] },
    { key: "description", words: ["описание", "текст", "description"] },
    { key: "exclusive", words: ["ексклузив", "ексклузивен", "exclusive"] },
    { key: "owner_name", words: ["собственик", "име на собственика", "продавач", "owner", "owner name"] },
    { key: "owner_phone", words: ["телефон на собственика", "тел собственик", "телефон собственик", "телефон", "owner phone", "phone"] },
    { key: "broker", words: ["брокер", "агент", "отговорник", "broker", "agent"] },
  ],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The best column for each field (each column used once): an exact name first, then the longest word inside it. */
export function guessMapping(kind: ImportKind, headers: string[]): Partial<Record<FieldKey, number>> {
  const scores: { key: FieldKey; column: number; score: number }[] = [];
  headers.forEach((header, column) => {
    const h = norm(header);
    for (const field of FIELDS[kind]) {
      field.words.forEach((word, i) => {
        const w = norm(word);
        const score = h === w ? 1000 - i : ` ${h} `.includes(` ${w} `) ? w.length * 10 - i : 0;
        if (score > 0) scores.push({ key: field.key, column, score });
      });
    }
  });
  scores.sort((a, b) => b.score - a.score);
  const mapping: Partial<Record<FieldKey, number>> = {};
  const used = new Set<number>();
  for (const s of scores) {
    if (mapping[s.key] !== undefined || used.has(s.column)) continue;
    mapping[s.key] = s.column;
    used.add(s.column);
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Reading the values

type ClientType = "buyer" | "seller" | "tenant" | "landlord" | "investor";

export function clientTypesOf(text: string): ClientType[] {
  const t = norm(text);
  const out = new Set<ClientType>();
  if (/наемодат|отдава|landlord/.test(t)) out.add("landlord");
  if (/наемат|под наем търси|tenant|renter/.test(t)) out.add("tenant");
  if (/купувач|купува|buyer/.test(t)) out.add("buyer");
  if (/продавач|продава|собственик|seller/.test(t)) out.add("seller");
  if (/инвеститор|investor/.test(t)) out.add("investor");
  return [...out];
}

export function classOf(text: string): "A" | "B" | "C" | null {
  const t = norm(text);
  if (/^a$|^а$|гор|hot/.test(t)) return "A";
  if (/^b$|^б$|^в$|топ|warm/.test(t)) return "B";
  if (/^c$|^с$|студ|cold/.test(t)) return "C";
  return null;
}

/** The property's kind in words → its code (the more specific first). */
const SUBTYPES: [RegExp, string][] = [
  [/етаж от къща|house floor/, "house_floor"],
  [/многост|5 ст|5ст|multi/, "multi_room"],
  [/четирист|4 ст|4ст|four/, "four_room"],
  [/трист|3 ст|3ст|three/, "three_room"],
  [/двуст|2 ст|2ст|two room|one bedroom/, "two_room"],
  [/едност|1 ст|1ст|студио|гарсониера|studio/, "studio"],
  [/мезонет|maisonette/, "maisonette"],
  [/ателие|таван|atelier|attic/, "atelier"],
  [/вила|villa/, "villa"],
  [/къща|house/, "house"],
  [/офис|office/, "office"],
  [/магазин|shop|store/, "shop"],
  [/заведение|ресторант|кафе|restaurant/, "restaurant"],
  [/хотел|hotel/, "hotel"],
  [/склад|warehouse/, "warehouse"],
  [/промишл|цех|industrial/, "industrial"],
  [/парцел|упи|plot/, "plot"],
  [/земедел|нива|земя|land/, "agricultural"],
  [/гора|forest/, "forest"],
  [/паркомяст|паркинг|parking/, "parking_space"],
  [/гараж|garage/, "garage"],
  [/апартамент|apartment|flat/, "two_room"],
];

export function subtypeOf(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  return SUBTYPES.find(([re]) => re.test(t))?.[1] ?? null;
}

export function operationOf(text: string): "sale" | "rent" | null {
  const t = norm(text);
  if (/наем|rent|let/.test(t)) return "rent";
  if (/продаж|продава|sale|sell/.test(t)) return "sale";
  return null;
}

/** "120 000 €" → 120000; "1.250,50 лв" → 1250.5. */
export function numberOf(text: string): number | null {
  const m = text.replace(/\s| /g, "").match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0];
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else if (/[.,]\d{3}[.,]\d{1,2}$/.test(s)) s = s.replace(/[.,](?=\d{3}[.,])/g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function currencyOf(text: string): "EUR" | "BGN" | "USD" | null {
  const t = text.toLowerCase();
  if (/лв|bgn|лева/.test(t)) return "BGN";
  if (/\$|usd|долар/.test(t)) return "USD";
  if (/€|eur|евро/.test(t)) return "EUR";
  return null;
}

/** "4/8" → floor 4 of 8; "партер" → 0. */
export function floorOf(text: string): { floor: number | null; total: number | null } {
  const t = norm(text);
  if (/партер|ground/.test(t)) return { floor: 0, total: null };
  const m = text.match(/(-?\d+)\s*(?:\/|от|of)\s*(\d+)/i);
  if (m) return { floor: Number(m[1]), total: Number(m[2]) };
  const n = text.match(/-?\d+/);
  return { floor: n ? Number(n[0]) : null, total: null };
}

export const yesOf = (text: string) => /^(да|yes|y|1|x|true|✓|ексклузив)/i.test(text.trim());

export type Member = { id: string; name: string; email: string };

/** A broker by name or e-mail ("Мария", "Мария Иванова", "maria@…"). */
export function brokerOf(text: string, members: Member[]): string | null {
  const t = norm(text);
  if (!t) return null;
  const byEmail = members.find((m) => m.email.toLowerCase() === text.trim().toLowerCase());
  if (byEmail) return byEmail.id;
  const exact = members.find((m) => norm(m.name) === t);
  if (exact) return exact.id;
  const words = t.split(" ");
  const partial = members.filter((m) => words.every((w) => norm(m.name).split(" ").includes(w)));
  return partial.length === 1 ? partial[0].id : null;
}
