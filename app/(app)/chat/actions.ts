"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (list: string[]) => list.filter((id) => UUID.test(id)).slice(0, 200);

async function client() {
  const session = await getSession();
  return session ? createClient() : null;
}

/** A group with the chosen colleagues (one colleague and no name: a personal chat). */
export async function createChatGroup(title: string, people: string[]): Promise<{ id?: string; error?: boolean }> {
  const supabase = await client();
  if (!supabase) return { error: true };
  const { data, error } = await supabase.rpc("create_chat_group", { group_title: title.trim().slice(0, 80) || null, people: ids(people) });
  if (error) console.error("Making a conversation failed:", error.message);
  revalidatePath("/chat");
  return error ? { error: true } : { id: data as string };
}

export async function answerChatInvite(room: string, accept: boolean) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { ok: false };
  const { error } = await supabase.rpc("answer_chat_invite", { target_room: room, accept });
  revalidatePath("/chat");
  return { ok: !error };
}

export async function setChatMuted(room: string, mute: boolean) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { ok: false };
  const { error } = await supabase.rpc("set_chat_muted", { target_room: room, mute });
  revalidatePath("/chat");
  return { ok: !error };
}

export async function renameChat(room: string, title: string) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { ok: false };
  const { error } = await supabase.rpc("rename_chat", { target_room: room, new_title: title.slice(0, 80) });
  revalidatePath(`/chat/${room}`);
  return { ok: !error };
}

export async function leaveChat(room: string) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { ok: false };
  const { error } = await supabase.rpc("leave_chat", { target_room: room });
  revalidatePath("/chat");
  return { ok: !error };
}

export async function addChatPeople(room: string, people: string[]) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { ok: false };
  const { error } = await supabase.rpc("add_chat_people", { target_room: room, people: ids(people) });
  revalidatePath(`/chat/${room}`);
  return { ok: !error };
}

/** A broker of another agency, by the e-mail they sign in with. */
export async function inviteToChat(room: string, email: string): Promise<{ result: "added" | "invited" | "not_found" | "already" | "error" }> {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return { result: "error" };
  const { data, error } = await supabase.rpc("invite_to_chat", { target_room: room, invite_email: email.trim().slice(0, 200) });
  if (error) console.error("Inviting to a conversation failed:", error.message);
  revalidatePath(`/chat/${room}`);
  return { result: error ? "error" : ((data as "added" | "invited" | "not_found" | "already") ?? "error") };
}

/** A listing, client or deal of BRIXA into the conversation, as a card. */
export async function sendChatCard(room: string, kind: "property" | "client" | "deal", target: string): Promise<{ ok: boolean; error?: "otherAgency" }> {
  const supabase = await client();
  if (!supabase || !UUID.test(room) || !UUID.test(target)) return { ok: false };
  const { error } = await supabase.rpc("send_chat_card", { target_room: room, card_kind: kind, target });
  if (error) console.error("Sending a card failed:", error.message);
  return error ? { ok: false, error: error.message.includes("not_with_other_agencies") ? "otherAgency" : undefined } : { ok: true };
}

export async function deleteChatMessage(message: string) {
  const supabase = await client();
  if (!supabase || !UUID.test(message)) return { ok: false };
  const { error } = await supabase.rpc("delete_chat_message", { target: message });
  return { ok: !error };
}

/** Read up to now (the conversation's pushes leave the notifications too). */
export async function markChatRead(room: string) {
  const supabase = await client();
  if (!supabase || !UUID.test(room)) return;
  await supabase.rpc("mark_chat_read", { target_room: room });
}

/** A personal chat: with a colleague at once; with someone of another agency, a request they accept. */
export async function startDirectChat(person: string): Promise<{ id?: string; error?: boolean }> {
  const supabase = await client();
  if (!supabase || !UUID.test(person)) return { error: true };
  const { data, error } = await supabase.rpc("start_direct_chat", { person });
  if (error) console.error("Starting a personal chat failed:", error.message);
  revalidatePath("/chat");
  return error ? { error: true } : { id: data as string };
}

export type BrixaPerson = { id: string; name: string; avatar_path: string | null; job_title: string | null; agency: string; same: boolean };

/** Anyone in BRIXA by name or agency (colleagues first). */
export async function searchBrixaPeople(q: string): Promise<BrixaPerson[]> {
  const supabase = await client();
  if (!supabase || q.trim().length < 2) return [];
  const { data } = await supabase.rpc("search_brixa_people", { q: q.trim().slice(0, 60) });
  return (data ?? []) as BrixaPerson[];
}
