import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat/ChatRoom";
import type { Colleague } from "@/components/chat/NewChat";
import type { RoomPerson } from "@/components/chat/RoomMenu";
import { chatTitle, MESSAGE_COLUMNS, type ChatMessage, type ChatSummary, type Reaction } from "@/lib/chat";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.chat.title };
}

/** A conversation: the last messages and their reactions, the people in it, and the colleagues who could join. */
export default async function ChatRoomPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, { t }] = await Promise.all([getSession(), getI18n()]);
  if (!session) return null;
  const supabase = await createClient();

  const [{ data: chats }, { data: rows }, { data: peopleRaw }, { data: mine }, { data: members }] = await Promise.all([
    supabase.rpc("my_chats"),
    supabase.from("chat_messages").select(MESSAGE_COLUMNS).eq("room_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.rpc("chat_people", { target_room: id }),
    supabase.from("chat_members").select("organization_id").eq("room_id", id).eq("profile_id", session.userId).maybeSingle(),
    supabase
      .from("organization_members")
      .select("profile_id, profiles(full_name, email, avatar_path)")
      .eq("organization_id", session.organizationId)
      .neq("profile_id", session.userId),
  ]);
  const chat = ((chats ?? []) as ChatSummary[]).find((c) => c.id === id);
  if (!chat || !mine) notFound();
  if (chat.status === "invited" && chat.kind !== "direct") redirect("/chat");

  const messages = ((rows ?? []) as ChatMessage[]).reverse();
  const { data: reactionRows } = messages.length
    ? await supabase.from("chat_reactions").select("message_id, profile_id, emoji").in("message_id", messages.map((m) => m.id))
    : { data: [] };

  const people = (peopleRaw ?? []) as (RoomPerson & { last_read_at: string | null })[];
  const inRoom = new Set(people.filter((p) => p.status !== "left").map((p) => p.id));
  const colleagues: Colleague[] = ((members ?? []) as unknown as { profile_id: string; profiles: { full_name: string | null; email: string; avatar_path: string | null } | null }[])
    .filter((m) => !inRoom.has(m.profile_id))
    .map((m) => ({ id: m.profile_id, name: m.profiles?.full_name || m.profiles?.email || "—", avatar_path: m.profiles?.avatar_path ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "bg"));

  const other = chat.kind === "direct" ? people.find((p) => p.id !== session.userId) : undefined;
  const count = fmt(t.chat.peopleCount, { n: chat.count });
  const subtitle =
    chat.kind === "direct"
      ? (other?.agency ?? t.chat.colleagues)
      : chat.kind === "office"
        ? `${t.chat.unitOffice} · ${count}`
        : chat.kind === "team"
          ? `${t.chat.unitTeam} · ${count}`
          : count;

  return (
    <ChatRoom
      room={id}
      kind={chat.kind}
      title={chatTitle(chat, t)}
      subtitle={subtitle}
      muted={chat.muted}
      shared={chat.shared}
      me={session.userId}
      myName={session.fullName || session.email}
      myOrg={mine.organization_id}
      platformAdmin={session.platformAdmin}
      people={people}
      colleagues={colleagues}
      initial={messages}
      initialReactions={(reactionRows ?? []) as Reaction[]}
      request={chat.status === "invited" ? { name: other?.name ?? "", agency: other?.agency ?? chat.home_agency ?? "" } : null}
    />
  );
}
