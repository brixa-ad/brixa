import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { ChatList } from "@/components/chat/ChatList";
import { NewChat, type Colleague } from "@/components/chat/NewChat";
import type { ChatSummary } from "@/lib/chat";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.chat.title };
}

/** The agency's chat, the groups and personal chats, and invitations from other agencies. */
export default async function ChatPage() {
  const [session, { t }] = await Promise.all([getSession(), getI18n()]);
  if (!session) return null;
  const supabase = await createClient();
  const [{ data: chats }, { data: members }] = await Promise.all([
    supabase.rpc("my_chats"),
    supabase
      .from("organization_members")
      .select("profile_id, profiles(full_name, email, avatar_path)")
      .eq("organization_id", session.organizationId)
      .neq("profile_id", session.userId),
  ]);
  const colleagues: Colleague[] = ((members ?? []) as unknown as { profile_id: string; profiles: { full_name: string | null; email: string; avatar_path: string | null } | null }[])
    .map((m) => ({ id: m.profile_id, name: m.profiles?.full_name || m.profiles?.email || "—", avatar_path: m.profiles?.avatar_path ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "bg"));

  return (
    <div className="space-y-6">
      <PageHeader title={t.chat.title} actions={colleagues.length > 0 ? <NewChat colleagues={colleagues} /> : undefined} />
      <ChatList chats={(chats ?? []) as ChatSummary[]} />
    </div>
  );
}
