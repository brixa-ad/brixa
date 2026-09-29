import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { addDays } from "./dates";
import { locale, type Lang } from "./i18n/dictionaries";
import type { TaskType } from "./options";
import { createClient } from "./supabase/server";
import { isWorkingDay } from "./workdays";

/**
 * The Open House Playbook, day by day: materials midweek, invitations, the neighbours, the signs
 * the evening before, hosting (30 minutes early), and the calls the next working day.
 */
export const PREP_STEPS: { key: "materials" | "invite_db" | "social" | "neighbors" | "signs" | "host" | "call_visitors" | "call_neighbors"; offset: number; type: TaskType }[] = [
  { key: "materials", offset: -4, type: "other" },
  { key: "invite_db", offset: -3, type: "message" },
  { key: "social", offset: -3, type: "other" },
  { key: "neighbors", offset: -2, type: "other" },
  { key: "signs", offset: -1, type: "other" },
  { key: "host", offset: 0, type: "meeting" },
  { key: "call_visitors", offset: 1, type: "call" },
  { key: "call_neighbors", offset: 1, type: "call" },
];

/** The day a step is due: before the event as planned (never in the past); after it, the next working day. */
export function prepDay(eventDay: string, offset: number, today: string) {
  if (offset > 0) {
    let day = addDays(eventDay, 1);
    while (!isWorkingDay(day)) day = addDays(day, 1);
    return day;
  }
  const day = addDays(eventDay, offset);
  return day < today ? today : day;
}

export type OpenHouse = {
  id: string;
  organization_id: string;
  property_id: string;
  host_id: string;
  day: string;
  starts_at: string;
  ends_at: string;
  token: string;
  note: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  property: {
    id: string;
    title: string;
    current_price: number | null;
    currency: string;
    area: number | null;
    rooms: number | null;
    floor: number | null;
    total_floors: number | null;
    operation_type: string;
    responsible_broker_id: string | null;
    settlement: { name: string; settlement_type: string } | null;
    neighborhood: { name: string } | null;
    subtype: { name: string; name_en: string | null } | null;
  } | null;
  host: { full_name: string | null; email: string; phone: string | null; avatar_path: string | null; job_title: string | null } | null;
};

export const OPEN_HOUSE_SELECT = `id, organization_id, property_id, host_id, day, starts_at, ends_at, token, note, cancelled_at, created_by,
  property:properties(id, title, current_price, currency, area, rooms, floor, total_floors, operation_type, responsible_broker_id,
    settlement:geo_settlements(name, settlement_type), neighborhood:geo_neighborhoods(name), subtype:property_subtypes(name, name_en)),
  host:profiles!open_houses_host_id_fkey(full_name, email, phone, avatar_path, job_title)`;

export async function getOpenHouse(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("open_houses").select(OPEN_HOUSE_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("Loading the open house failed:", error.message);
  return (data as unknown as OpenHouse | null) ?? null;
}

export type Visitor = {
  id: string;
  client_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  kind: "buyer" | "neighbor" | "agent" | "curious";
  price_opinion: "low" | "right" | "high" | null;
  rating: number | null;
  liked: string | null;
  looking_for: string | null;
  created_at: string;
};

/** "Иван Петров" style place line: the neighbourhood and the town. */
export const placeOf = (p: OpenHouse["property"]) =>
  p ? [p.neighborhood?.name, p.settlement ? `${p.settlement.settlement_type} ${p.settlement.name}` : null].filter(Boolean).join(", ") : "";

/** "събота, 4 октомври" */
export const weekdayDate = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

export const hhmm = (time: string) => time.slice(0, 5);

/** This site's address (for the links in the QR codes). */
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "brixa-yavlena.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** A QR code as an SVG string. */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a1330", light: "#ffffff" } });
}
