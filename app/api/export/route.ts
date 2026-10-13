import writeXlsxFile, { type Row, type Sheet } from "write-excel-file/node";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { PHOTO_BUCKET } from "@/lib/photos";
import { getSession } from "@/lib/session";
import { sofiaToday } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Everything the agency has put into BRIXA, one sheet per table — for the owner (the terms, section 18:
 * the agency can take its data at any time; the Data Act and GDPR portability).
 * `parent`: a table without the agency's id is narrowed through the record it belongs to.
 */
type Part = { table: string; sheet: string; order: string; org?: boolean; parent?: { table: string; key: string } };

const PARTS: Part[] = [
  { table: "organizations", sheet: "Агенция", order: "id" },
  { table: "offices", sheet: "Офиси", order: "id", org: true },
  { table: "teams", sheet: "Екипи", order: "id", org: true },
  { table: "clients", sheet: "Клиенти", order: "id", org: true },
  { table: "client_searches", sheet: "Търсения", order: "id", parent: { table: "clients", key: "client_id" } },
  { table: "client_offers", sheet: "Оферти на клиенти", order: "id", parent: { table: "clients", key: "client_id" } },
  { table: "client_financing", sheet: "Финансиране", order: "client_id", parent: { table: "clients", key: "client_id" } },
  { table: "client_identity", sheet: "Лични дати на клиенти", order: "client_id", org: true },
  { table: "client_temperatures", sheet: "Температура на клиенти", order: "client_id", org: true },
  { table: "client_news", sheet: "Съобщения към клиенти", order: "id", org: true },
  { table: "properties", sheet: "Имоти", order: "id", org: true },
  { table: "property_feature_values", sheet: "Удобства на имоти", order: "property_id", parent: { table: "properties", key: "property_id" } },
  { table: "property_price_history", sheet: "История на цените", order: "id", parent: { table: "properties", key: "property_id" } },
  { table: "property_photos", sheet: "Снимки", order: "id", parent: { table: "properties", key: "property_id" } },
  { table: "property_documents", sheet: "Документи", order: "id", parent: { table: "properties", key: "property_id" } },
  { table: "property_dossiers", sheet: "Досиета на имоти", order: "property_id", parent: { table: "properties", key: "property_id" } },
  { table: "property_doc_status", sheet: "Чеклист документи", order: "property_id", parent: { table: "properties", key: "property_id" } },
  { table: "property_comparables", sheet: "Сравними имоти", order: "id", org: true },
  { table: "market_prices", sheet: "Справочни цени", order: "id", org: true },
  { table: "deals", sheet: "Сделки", order: "id", org: true },
  { table: "deal_offers", sheet: "Оферти по сделки", order: "id", parent: { table: "deals", key: "deal_id" } },
  { table: "deal_stage_log", sheet: "Етапи на сделки", order: "id", org: true },
  { table: "deal_reminders", sheet: "Напомняния по сделки", order: "id", parent: { table: "deals", key: "deal_id" } },
  { table: "closed_deals", sheet: "Приключени сделки", order: "id", org: true },
  { table: "tasks", sheet: "Задачи", order: "id", org: true },
  { table: "activities", sheet: "История на контактите", order: "id", org: true },
  { table: "contact_programs", sheet: "Програми за контакт", order: "id", org: true },
  { table: "partners", sheet: "Колеги", order: "id", org: true },
  { table: "partner_searches", sheet: "Търсения на колеги", order: "id", org: true },
  { table: "open_houses", sheet: "Отворени врати", order: "id", org: true },
  { table: "open_house_visitors", sheet: "Посетители", order: "id", org: true },
  { table: "lead_forms", sheet: "Форми", order: "id", org: true },
  { table: "lead_form_responses", sheet: "Отговори от форми", order: "id", org: true },
  { table: "property_shares", sheet: "Споделени имоти", order: "id", org: true },
  { table: "search_shares", sheet: "Споделени търсения", order: "id", org: true },
  { table: "owner_reports", sheet: "Отчети за собственици", order: "id", org: true },
  { table: "analysis_shares", sheet: "Изпратени анализи", order: "id", org: true },
  { table: "share_events", sheet: "Отваряния на линкове", order: "id", org: true },
  { table: "marketing_done", sheet: "Маркетинг", order: "id", org: true },
  { table: "broker_goals", sheet: "Цели на брокери", order: "id", org: true },
  { table: "group_goals", sheet: "Цели на екипи", order: "id", org: true },
  { table: "broker_plans", sheet: "Планове", order: "id", org: true },
  { table: "broker_finance", sheet: "Финанси на брокери", order: "id", org: true },
  { table: "broker_expenses", sheet: "Разходи", order: "id", org: true },
  { table: "payments", sheet: "Плащания към BRIXA", order: "id", org: true },
];

/** Keys to links, not data: left out (the terms, section 18 — security data). */
const SECRET = /(^|_)(token|secret|password|key)$/;
const PAGE = 1000;
const MAX_CELL = 32000;

type Value = string | number | boolean | null;
const cell = (value: unknown): Value => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
};

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!session.isOwner) return new Response("Forbidden", { status: 403 });
  const supabase = await createClient();
  const org = session.organizationId;

  async function rows(part: Part): Promise<Record<string, unknown>[] | null> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const select = part.parent ? `*, ${part.parent.table}!inner(organization_id)` : "*";
      let query = supabase.from(part.table).select(select);
      if (part.table === "organizations") query = query.eq("id", org);
      if (part.org) query = query.eq("organization_id", org);
      if (part.parent) query = query.eq(`${part.parent.table}.organization_id`, org);
      const { data, error } = await query.order(part.order).range(from, from + PAGE - 1);
      if (error) {
        console.error(`Export of ${part.table} failed:`, error.message);
        return null;
      }
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of page) {
        if (part.parent) delete row[part.parent.table];
        out.push(row);
      }
      if (page.length < PAGE) return out;
    }
  }

  const results = await Promise.all(PARTS.map(async (part) => ({ part, data: await rows(part) })));

  // the people: who is in the agency, with their role
  const { data: people } = await supabase
    .from("organization_members")
    .select("role, office_id, team_id, created_at, profile:profiles(id, full_name, email, phone, job_title)")
    .eq("organization_id", org);
  const peopleRows = (people ?? []).map((m) => {
    const p = m.profile as unknown as { id: string; full_name: string | null; email: string; phone: string | null; job_title: string | null } | null;
    return { profile_id: p?.id ?? null, full_name: p?.full_name ?? null, email: p?.email ?? null, phone: p?.phone ?? null, job_title: p?.job_title ?? null, role: m.role, office_id: m.office_id, team_id: m.team_id, joined_at: m.created_at };
  });

  // the photos and the documents: a link to each file, for 7 days
  const files: Record<string, unknown>[] = [];
  for (const [table, bucket, kind] of [
    ["property_photos", PHOTO_BUCKET, "снимка"],
    ["property_documents", DOCUMENT_BUCKET, "документ"],
  ] as const) {
    const list = results.find((r) => r.part.table === table)?.data ?? [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const paths = chunk.map((row) => String(row.storage_path ?? "")).filter(Boolean);
      if (paths.length === 0) continue;
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, 7 * 24 * 3600);
      const links = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      for (const row of chunk) {
        files.push({ kind, property_id: row.property_id, file: row.storage_path, link: links.get(String(row.storage_path)) ?? null });
      }
    }
  }

  const sheetOf = (name: string, data: Record<string, unknown>[]): Sheet<never> => {
    const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((column) => !SECRET.test(column));
    const body: Row[] = data.map((row) => columns.map((column) => cell(row[column])));
    return { sheet: name.slice(0, 31), data: [columns.map((c) => ({ value: c, fontWeight: "bold" as const })), ...body], stickyRowsCount: 1 };
  };

  const today = sofiaToday();
  const sheets: Sheet<never>[] = [];
  const summary: Row[] = [];
  const add = (name: string, data: Record<string, unknown>[] | null) => {
    summary.push([name, data === null ? "не успяхме да ги прочетем — пишете ни" : data.length]);
    if (data && data.length > 0) sheets.push(sheetOf(name, data));
  };
  add("Хора", peopleRows);
  for (const { part, data } of results) add(part.sheet, data);
  add("Файлове", files);

  const readme: Row[] = [
    [{ value: `BRIXA — всички данни на ${session.organizationName}`, fontWeight: "bold" }],
    [`Изтеглено на ${today} от ${session.fullName || session.email}`],
    [],
    ["Всеки лист е една таблица. Първият ред са имената на колоните; колоните, завършващи на _id, свързват листовете (например client_id в „Търсения“ е id в „Клиенти“)."],
    ["Линковете в „Файлове“ отварят снимките и документите в оригиналния им формат и работят 7 дни."],
    ["Не са включени: вътрешният чат (лична кореспонденция на потребителите), техническите журнали и данните за сигурност (например ключовете на линковете), обобщените данни на BRIXA и програмният ѝ код."],
    [],
    [{ value: "Лист", fontWeight: "bold" }, { value: "Редове", fontWeight: "bold" }],
    ...summary,
  ];

  const buffer = await writeXlsxFile([{ sheet: "Прочети ме", data: readme, columns: [{ width: 60 }, { width: 14 }] }, ...sheets]).toBuffer();
  const name = `BRIXA ${session.organizationName} ${today}.xlsx`.replace(/[\\/:*?"<>|]+/g, " ");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="BRIXA-export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
