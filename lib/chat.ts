import { fmt, type Dictionary } from "./i18n/dictionaries";

export const CHAT_BUCKET = "chat-files";
/** The size a file may have (the bucket takes up to 25 MB). */
export const CHAT_MAX_BYTES = 25 * 1024 * 1024;

/** The agency's, an office's, a team's, a group, a personal chat, everyone in BRIXA. */
export type ChatKind = "agency" | "office" | "team" | "group" | "direct" | "brixa";

export const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;
export type Reaction = { message_id: string; profile_id: string; emoji: string };

export type ChatPerson = { id: string; name: string; avatar_path: string | null; agency: string | null; invited: boolean };

export type ChatSummary = {
  id: string;
  kind: ChatKind;
  title: string | null;
  shared: boolean;
  status: "active" | "invited";
  muted: boolean;
  agency: string | null;
  /** the office's or team's name */
  unit: string | null;
  home_agency: string | null;
  count: number;
  people: ChatPerson[];
  last_at: string;
  last: { kind: string; text: string; sender: string; mine: boolean; deleted: boolean } | null;
  unread: number;
};

export type ChatCard = {
  title?: string;
  name?: string;
  client?: string | null;
  operation?: string | null;
  status?: string;
  stage?: string;
  kind?: string;
  price?: number | null;
  currency?: string | null;
  area?: number | null;
  rooms?: number | null;
  place?: string | null;
  photo?: string | null;
  types?: string[];
  class?: string;
  budget_max?: number | null;
  org?: string;
  /** a listing sent to another agency: its public link (/p/…) */
  share?: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string | null;
  organization_id: string;
  kind: "text" | "property" | "client" | "deal" | "image" | "file" | "voice" | "system";
  body: string | null;
  ref_id: string | null;
  card: ChatCard | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  duration_s: number | null;
  reply_to: string | null;
  created_at: string;
  deleted_at: string | null;
};

export const MESSAGE_COLUMNS =
  "id, room_id, sender_id, organization_id, kind, body, ref_id, card, file_path, file_name, file_type, file_size, duration_s, reply_to, created_at, deleted_at";

/** A conversation's name: the agency's, the office's or team's, the group's, the person's, or BRIXA's. */
export function chatTitle(chat: Pick<ChatSummary, "kind" | "title" | "agency" | "unit" | "people">, t: Dictionary) {
  if (chat.kind === "agency") return chat.agency ?? t.chat.agencyChat;
  if (chat.kind === "brixa") return t.chat.brixaChat;
  if (chat.kind === "office" || chat.kind === "team") return chat.unit ?? "—";
  if (chat.title) return chat.title;
  const names = chat.people.map((p) => p.name);
  return names.length === 0 ? t.chat.justYou : names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
}

/** What a message says in a line (a reply's quote). */
export function messageLine(m: Pick<ChatMessage, "kind" | "body" | "card" | "file_name" | "deleted_at">, t: Dictionary) {
  if (m.deleted_at) return t.chat.deleted;
  if (m.kind === "text") return m.body ?? "";
  if (m.kind === "image") return `📷 ${t.chat.photo}`;
  if (m.kind === "voice") return `🎤 ${t.chat.voice}`;
  if (m.kind === "file") return `📎 ${m.file_name ?? t.chat.file}`;
  if (m.kind === "property") return `🏠 ${m.card?.title ?? ""}`;
  if (m.kind === "client") return `👤 ${m.card?.name ?? ""}`;
  if (m.kind === "deal") return `🤝 ${m.card?.title ?? ""}`;
  return "";
}

/** "Мария joined", "Иван left" — the conversation's own lines. */
export function systemText(body: string | null, t: Dictionary) {
  const [what, ...rest] = (body ?? "").split(":");
  const who = rest.join(":");
  if (what === "joined") return fmt(t.chat.joined, { name: who });
  if (what === "left") return fmt(t.chat.left, { name: who });
  if (what === "added") return fmt(t.chat.added, { name: who });
  return body ?? "";
}

export function fileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function duration(seconds: number | null) {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
