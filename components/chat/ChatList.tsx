"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Building, Building2, Globe, PenSquare, Search, Users, UsersRound } from "lucide-react";
import { answerChatInvite, searchBrixaPeople, startDirectChat, type BrixaPerson } from "@/app/(app)/chat/actions";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { Modal as ModalShell } from "@/components/ui/Modal";
import { chatTitle, type ChatSummary } from "@/lib/chat";
import { sofiaDay, sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { NewGroup, type Colleague } from "./NewChat";

export function ChatIcon({ chat, size = "md" }: { chat: Pick<ChatSummary, "kind" | "people">; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8" : "size-10";
  const icon = size === "sm" ? "size-4" : "size-5";
  if (chat.kind === "direct" && chat.people[0]) {
    return <Avatar path={chat.people[0].avatar_path} name={chat.people[0].name} size={size} />;
  }
  const look =
    chat.kind === "brixa"
      ? { Icon: Globe, tone: "bg-gradient-to-br from-accent to-brand-cyan text-white" }
      : chat.kind === "agency"
        ? { Icon: Building2, tone: "bg-accent text-on-accent" }
        : chat.kind === "office"
          ? { Icon: Building, tone: "bg-accent-soft text-accent-fg" }
          : chat.kind === "team"
            ? { Icon: UsersRound, tone: "bg-accent-soft text-accent-fg" }
            : { Icon: Users, tone: "bg-raised text-fg-2" };
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full ${look.tone}`}>
      <look.Icon className={icon} />
    </span>
  );
}

type Filter = "all" | "direct" | "groups" | "unread";

/** Messenger-like: search people and conversations, filters, requests on top, the newest first. */
export function ChatList({ chats, colleagues }: { chats: ChatSummary[]; colleagues: Colleague[] }) {
  const { t, lang } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [people, setPeople] = useState<BrixaPerson[]>([]);
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

  // people in BRIXA, as one types
  useEffect(() => {
    const q = query.trim();
    let alive = true;
    const timer = setTimeout(async () => {
      const found = q.length >= 2 ? await searchBrixaPeople(q) : [];
      if (alive) setPeople(found);
    }, q.length >= 2 ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const write = (person: string) =>
    startTransition(async () => {
      const result = await startDirectChat(person);
      if (result.id) router.push(`/chat/${result.id}`);
    });

  const invites = chats.filter((c) => c.status === "invited");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter(
      (c) =>
        c.status === "active" &&
        (filter === "all" ||
          (filter === "direct" && c.kind === "direct") ||
          (filter === "groups" && c.kind !== "direct") ||
          (filter === "unread" && Number(c.unread) > 0)) &&
        (!q || chatTitle(c, t).toLowerCase().includes(q) || c.people.some((p) => p.name.toLowerCase().includes(q)))
    );
  }, [chats, filter, query, t]);
  // in the search: the colleagues (no chat with them yet) and the rest of BRIXA
  const q = query.trim().toLowerCase();
  const colleaguesFound = q ? colleagues.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const othersFound = people.filter((p) => !p.same);

  const chip = (key: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === key ? "bg-accent-soft text-accent-fg" : "bg-raised text-fg-2 hover:text-fg"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NewMessage colleagues={colleagues} onWrite={write} />
        {colleagues.length > 0 && <NewGroup colleagues={colleagues} />}
      </div>

      <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4">
        <Search className="size-4 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={C.searchAll} className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none sm:text-sm" />
      </label>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {chip("all", C.filterAll)}
        {chip("direct", C.filterDirect)}
        {chip("groups", C.filterGroups)}
        {chip("unread", C.filterUnread)}
      </div>

      {invites.length > 0 && (
        <ul className="space-y-2">
          {invites.map((chat) => {
            const by = chat.people.find((p) => !p.invited);
            const direct = chat.kind === "direct";
            return (
              <li key={chat.id} className="rounded-2xl border border-accent/40 bg-surface p-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <ChatIcon chat={chat} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{direct ? C.messageRequest : C.invitations}</p>
                    <p className="truncate font-semibold">{chatTitle(chat, t)}</p>
                    <p className="truncate text-sm text-muted">
                      {direct && chat.last ? chat.last.text : fmt(direct ? C.requestFrom : C.invitedBy, { actor: by?.name ?? "", agency: chat.home_agency ?? "" })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await answerChatInvite(chat.id, true);
                        router.push(`/chat/${chat.id}`);
                      })
                    }
                    className={buttonClass.primary}
                  >
                    {C.accept}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await answerChatInvite(chat.id, false);
                        router.refresh();
                      })
                    }
                    className={buttonClass.ghost}
                  >
                    {C.decline}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length === 0 && colleaguesFound.length === 0 && othersFound.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">{query ? C.noResults : C.empty}</p>
      ) : (
        shown.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {shown.map((chat) => {
              const day = sofiaDay(chat.last_at);
              const when =
                day === today
                  ? new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(chat.last_at))
                  : formatDate(chat.last_at, lang);
              const last = !chat.last
                ? null
                : chat.last.deleted
                  ? C.deleted
                  : chat.last.mine
                    ? `${C.you}: ${chat.last.text}`
                    : chat.kind === "direct"
                      ? chat.last.text
                      : `${chat.last.sender}: ${chat.last.text}`;
              const unread = Number(chat.unread);
              return (
                <li key={chat.id} className="border-b border-line-soft last:border-0">
                  <Link href={`/chat/${chat.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised">
                    <ChatIcon chat={chat} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`truncate ${unread > 0 ? "font-bold" : "font-semibold"}`}>{chatTitle(chat, t)}</span>
                        {(chat.kind === "office" || chat.kind === "team") && (
                          <span className="shrink-0 rounded-full bg-raised px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted">
                            {chat.kind === "office" ? C.unitOffice : C.unitTeam}
                          </span>
                        )}
                        {chat.shared && chat.kind !== "brixa" && <Globe className="size-3.5 shrink-0 text-brand-cyan" />}
                        {chat.muted && <BellOff className="size-3.5 shrink-0 text-subtle" />}
                      </span>
                      <span className={`block truncate text-sm ${unread > 0 ? "font-semibold text-fg" : "text-muted"}`}>
                        {last ?? (chat.kind === "direct" ? chat.people[0]?.agency : fmt(C.peopleCount, { n: chat.count })) ?? ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-xs ${unread > 0 && !chat.muted ? "font-semibold text-accent-fg" : "text-subtle"}`}>{when}</span>
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
        )
      )}

      {(colleaguesFound.length > 0 || othersFound.length > 0) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg-2">{C.peopleInBrixa}</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {[...colleaguesFound.map((p) => ({ ...p, agency: null as string | null })), ...othersFound].map((p) => (
              <li key={p.id} className="border-b border-line-soft last:border-0">
                <button type="button" disabled={pending} onClick={() => write(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-raised">
                  <Avatar path={p.avatar_path} name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.agency ?? C.colleagues}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-accent-fg">{C.writeTo}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "New message": a colleague, or anyone in BRIXA found by name. */
function NewMessage({ colleagues, onWrite }: { colleagues: Colleague[]; onWrite: (person: string) => void }) {
  const { t } = useI18n();
  const C = t.chat;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<BrixaPerson[]>([]);

  useEffect(() => {
    const q = query.trim();
    let alive = true;
    const timer = setTimeout(async () => {
      const found = q.length >= 2 ? await searchBrixaPeople(q) : [];
      if (alive) setPeople(found.filter((p) => !p.same));
    }, q.length >= 2 ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const mine = colleagues.filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.primary}>
        <PenSquare className="size-4" />
        {C.newMessage}
      </button>
      {open && (
        <ModalShell title={C.newMessage} onClose={() => setOpen(false)}>
          <label className="mb-3 flex items-center gap-2 rounded-lg border border-line-strong bg-raised px-3">
            <Search className="size-4 text-muted" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={C.searchAll} className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none sm:text-sm" />
          </label>
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {mine.length > 0 && <li className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{C.colleagues}</li>}
            {mine.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onWrite(p.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-raised">
                  <Avatar path={p.avatar_path} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                </button>
              </li>
            ))}
            {people.length > 0 && <li className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{C.peopleInBrixa}</li>}
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onWrite(p.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-raised">
                  <Avatar path={p.avatar_path} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.agency}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ModalShell>
      )}
    </>
  );
}
