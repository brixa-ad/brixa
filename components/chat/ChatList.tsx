"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Building2, Globe, Users } from "lucide-react";
import { answerChatInvite } from "@/app/(app)/chat/actions";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { chatTitle, type ChatSummary } from "@/lib/chat";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { sofiaDay, sofiaToday } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

function ChatIcon({ chat }: { chat: ChatSummary }) {
  if (chat.kind === "agency") {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
        <Building2 className="size-5" />
      </span>
    );
  }
  if (chat.people.length === 1) return <Avatar path={chat.people[0].avatar_path} name={chat.people[0].name} />;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg">
      <Users className="size-5" />
    </span>
  );
}

/** My conversations: the agency's first, invitations, then the latest; they move as messages come. */
export function ChatList({ chats }: { chats: ChatSummary[] }) {
  const { t, lang } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = sofiaToday();

  // a new message anywhere: the list moves
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("chat-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 500);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const invites = chats.filter((c) => c.status === "invited");
  const active = chats.filter((c) => c.status === "active");

  return (
    <div className="space-y-6">
      {invites.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg-2">{C.invitations}</h2>
          <ul className="space-y-2">
            {invites.map((chat) => {
              const by = chat.people.find((p) => !p.invited);
              return (
                <li key={chat.id} className="rounded-2xl border border-accent/40 bg-surface p-4 shadow-xs">
                  <p className="font-semibold">{chatTitle(chat, t)}</p>
                  <p className="mt-0.5 text-sm text-muted">{fmt(C.invitedBy, { actor: by?.name ?? "", agency: chat.home_agency })}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => {
                        await answerChatInvite(chat.id, true);
                        router.push(`/chat/${chat.id}`);
                      })}
                      className={buttonClass.primary}
                    >
                      {C.accept}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => {
                        await answerChatInvite(chat.id, false);
                        router.refresh();
                      })}
                      className={buttonClass.ghost}
                    >
                      {C.decline}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {active.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">{C.empty}</p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {active.map((chat) => {
            const day = sofiaDay(chat.last_at);
            const when =
              day === today
                ? new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(chat.last_at))
                : formatDate(chat.last_at, lang);
            // "You: …", "Мария: …" — in a personal chat just the words
            const personal = chat.kind === "group" && chat.people.length === 1;
            const last = !chat.last
              ? null
              : chat.last.deleted
                ? C.deleted
                : chat.last.mine
                  ? `${C.you}: ${chat.last.text}`
                  : personal
                    ? chat.last.text
                    : `${chat.last.sender}: ${chat.last.text}`;
            const unread = Number(chat.unread);
            return (
              <li key={chat.id}>
                <Link href={`/chat/${chat.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised">
                  <ChatIcon chat={chat} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate ${unread > 0 ? "font-bold" : "font-semibold"}`}>{chatTitle(chat, t)}</span>
                      {chat.shared && <Globe className="size-3.5 shrink-0 text-brand-cyan" aria-label={C.sharedNote} />}
                      {chat.muted && <BellOff className="size-3.5 shrink-0 text-subtle" aria-label={C.muted} />}
                    </span>
                    {last && <span className={`block truncate text-sm ${unread > 0 ? "font-medium text-fg" : "text-muted"}`}>{last}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-subtle">{when}</span>
                    {unread > 0 && (
                      <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-5 ${chat.muted ? "bg-raised text-fg-2" : "bg-accent text-on-accent"}`}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
