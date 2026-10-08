import { fmt, type Dictionary } from "./i18n/dictionaries";

export const CHAT_BUCKET = "chat-files";
/** The size a file may have (the bucket takes up to 25 MB). */
export const CHAT_MAX_BYTES = 25 * 1024 * 1024;

export type ChatPerson = { id: string; name: string; avatar_path: string | null; agency: string | null; invited: boolean };

export type ChatSummary = {
  id: string;
  kind: "agency" | "group";
  title: string | null;
  shared: boolean;
  status: "active" | "invited";
  muted: boolean;
  agency: string | null;
  home_agency: string;
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
  created_at: string;
  deleted_at: string | null;
};

export const MESSAGE_COLUMNS =
  "id, room_id, sender_id, organization_id, kind, body, ref_id, card, file_path, file_name, file_type, file_size, duration_s, created_at, deleted_at";

/** A conversation's name: the agency's, the group's, or the people in it. */
export function chatTitle(chat: Pick<ChatSummary, "kind" | "title" | "agency" | "people">, t: Dictionary) {
  if (chat.kind === "agency") return chat.agency ?? t.chat.agencyChat;
  if (chat.title) return chat.title;
  const names = chat.people.map((p) => p.name);
  return names.length === 0 ? t.chat.justYou : names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
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
