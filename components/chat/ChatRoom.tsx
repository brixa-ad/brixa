"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BellOff, Globe, MoreVertical } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { deleteChatMessage, markChatRead, startDirectChat } from "@/app/(app)/chat/actions";
import { useI18n } from "@/components/I18nProvider";
import { closeChatNotifications } from "@/components/push/ServiceWorker";
import { MESSAGE_COLUMNS, messageLine, type ChatKind, type ChatMessage, type Reaction } from "@/lib/chat";
import { addDays, sofiaDay, sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { CardPicker } from "./CardPicker";
import { ChatIcon } from "./ChatList";
import { Composer, type CardKind } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import type { Colleague } from "./NewChat";
import { RoomMenu, type RoomPerson } from "./RoomMenu";

const PAGE = 60;

const byTime = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at);

/** The typing list without one person. */
function without(current: Record<string, string>, id: string) {
  const next = { ...current };
  delete next[id];
  return next;
}

/** One conversation, like Messenger: messages as they come, reactions, replies, "typing…" and "seen". */
export function ChatRoom({
  room,
  kind,
  title,
  subtitle,
  muted,
  shared,
  me,
  myName,
  myOrg,
  platformAdmin,
  people,
  colleagues,
  initial,
  initialReactions,
}: {
  room: string;
  kind: ChatKind;
  title: string;
  subtitle: string;
  muted: boolean;
  shared: boolean;
  me: string;
  myName: string;
  myOrg: string;
  /** BRIXA's own may take messages down in everyone's conversation */
  platformAdmin: boolean;
  people: (RoomPerson & { last_read_at?: string | null })[];
  colleagues: Colleague[];
  initial: ChatMessage[];
  initialReactions: Reaction[];
}) {
  const { t, lang } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions);
  const [reads, setReads] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.filter((p) => p.last_read_at).map((p) => [p.id, p.last_read_at as string]))
  );
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [more, setMore] = useState(initial.length >= PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; text: string } | null>(null);
  const [picking, setPicking] = useState<CardKind | null>(null);
  const [menu, setMenu] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const keepFrom = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTyping = useRef(0);

  const read = useCallback(() => {
    closeChatNotifications(room);
    void markChatRead(room).then(() => window.dispatchEvent(new Event("brixa:chat-read")));
  }, [room]);

  const add = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const at = current.findIndex((m) => m.id === message.id);
      if (at >= 0) {
        const next = current.slice();
        next[at] = { ...current[at], ...message };
        return next;
      }
      return [...current, message].sort(byTime);
    });
  }, []);

  // read on opening; messages, reactions, "seen" and "typing…" come by themselves
  useEffect(() => {
    read();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const channel = supabase
      .channel(`chat:${room}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${room}` }, (payload) => {
        const message = payload.new as ChatMessage;
        if (!message?.id) return;
        add(message);
        if (payload.eventType === "INSERT" && message.sender_id) {
          // they wrote: no longer typing
          setTyping((current) => without(current, message.sender_id as string));
          if (message.sender_id !== me && document.visibilityState === "visible") {
            clearTimeout(timer);
            timer = setTimeout(read, 800);
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions", filter: `room_id=eq.${room}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const gone = payload.old as Partial<Reaction>;
          setReactions((current) => current.filter((r) => !(r.message_id === gone.message_id && r.profile_id === gone.profile_id)));
        } else {
          const r = payload.new as Reaction;
          setReactions((current) => [...current.filter((x) => !(x.message_id === r.message_id && x.profile_id === r.profile_id)), r]);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members", filter: `room_id=eq.${room}` }, (payload) => {
        const m = payload.new as { profile_id: string; last_read_at: string };
        if (m?.profile_id && m.profile_id !== me) setReads((current) => ({ ...current, [m.profile_id]: m.last_read_at }));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = payload as { id?: string; name?: string };
        if (!who.id || who.id === me) return;
        setTyping((current) => ({ ...current, [who.id as string]: who.name ?? "" }));
        clearTimeout(typingTimers.get(who.id));
        typingTimers.set(
          who.id,
          setTimeout(() => setTyping((current) => without(current, who.id as string)), 4000)
        );
      })
      .subscribe();
    channelRef.current = channel;
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      typingTimers.forEach((x) => clearTimeout(x));
      document.removeEventListener("visibilitychange", onVisible);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [room, me, add, read]);

  // stay at the bottom as messages come (unless reading further up); keep the place when older ones load
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("chat_messages")
      .select(MESSAGE_COLUMNS)
      .eq("room_id", room)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const older = ((data ?? []) as ChatMessage[]).reverse();
    setMore(older.length >= PAGE);
    if (older.length > 0) {
      const { data: more } = await supabase.from("chat_reactions").select("message_id, profile_id, emoji").in("message_id", older.map((m) => m.id));
      setReactions((current) => [...current, ...((more ?? []) as Reaction[])]);
    }
    if (list.current) keepFrom.current = list.current.scrollHeight - list.current.scrollTop;
    setMessages((current) => [...older.filter((m) => !current.some((c) => c.id === m.id)), ...current]);
  }

  async function react(message: ChatMessage, emoji: string) {
    const supabase = createClient();
    const mine = reactions.find((r) => r.message_id === message.id && r.profile_id === me);
    const before = reactions;
    setSelected(null);
    // (a query only goes out when it's awaited)
    if (mine?.emoji === emoji) {
      setReactions((current) => current.filter((r) => r !== mine));
      const { error } = await supabase.from("chat_reactions").delete().eq("message_id", message.id).eq("profile_id", me);
      if (error) setReactions(before);
    } else {
      setReactions((current) => [...current.filter((r) => r !== mine), { message_id: message.id, profile_id: me, emoji }]);
      const { error } = await supabase.from("chat_reactions").upsert({ message_id: message.id, profile_id: me, room_id: room, emoji });
      if (error) {
        console.error("A reaction failed:", error.message);
        setReactions(before);
      }
    }
  }

  function sayTyping() {
    const now = Date.now();
    if (now - lastTyping.current < 2500) return;
    lastTyping.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { id: me, name: myName } });
  }

  const who = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const byMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) map.set(r.message_id, [...(map.get(r.message_id) ?? []), r]);
    return map;
  }, [reactions]);
  const today = sofiaToday();
  const yesterday = addDays(today, -1);
  const timeOf = (iso: string) => new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(iso));
  const nameOf = (id: string | null) => (id === me ? C.you : (id && who.get(id)?.name) || "—");

  // "seen": in a personal chat, under my last message once the other has read it
  const other = kind === "direct" ? people.find((p) => p.id !== me && p.status !== "left") : undefined;
  const lastMine = [...messages].reverse().find((m) => m.sender_id === me && m.kind !== "system" && !m.deleted_at);
  const seen = Boolean(other?.status === "active" && lastMine && reads[other.id] && reads[other.id] >= lastMine.created_at);
  const typers = Object.values(typing);

  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 bg-canvas">
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <header className="flex items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
          <Link href="/chat" className="grid size-10 shrink-0 place-items-center rounded-full text-fg-2 transition hover:bg-raised" aria-label={C.title}>
            <ArrowLeft className="size-5" />
          </Link>
          <button type="button" onClick={() => setMenu(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <ChatIcon chat={{ kind, people: other ? [{ ...other, invited: false }] : [] }} size="sm" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{title}</span>
                {shared && kind !== "brixa" && <Globe className="size-3.5 shrink-0 text-brand-cyan" />}
                {muted && <BellOff className="size-3.5 shrink-0 text-subtle" />}
              </span>
              <span className="block truncate text-xs text-muted">{typers.length > 0 ? (typers.length === 1 ? fmt(C.typing, { name: typers[0] }) : C.typingMany) : subtitle}</span>
            </span>
          </button>
          <button type="button" onClick={() => setMenu(true)} className="grid size-10 shrink-0 place-items-center rounded-full text-fg-2 transition hover:bg-raised" aria-label={C.people}>
            <MoreVertical className="size-5" />
          </button>
        </header>

        <div
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {more && (
            <div className="mb-2 text-center">
              <button type="button" onClick={() => void loadOlder()} className="rounded-full bg-raised px-3 py-1.5 text-xs font-medium text-fg-2 hover:text-fg">
                {C.older}
              </button>
            </div>
          )}
          {messages.length === 0 && <p className="mx-auto mt-16 max-w-xs text-center text-sm text-muted">{C.noMessages}</p>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const day = sofiaDay(m.created_at);
            const newDay = !prev || sofiaDay(prev.created_at) !== day;
            const sameRun = !newDay && prev && prev.sender_id === m.sender_id && prev.kind !== "system" && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
            const person = m.sender_id ? who.get(m.sender_id) : undefined;
            const mine = m.sender_id === me;
            const counts = new Map<string, number>();
            for (const r of byMessage.get(m.id) ?? []) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
            const answered = m.reply_to ? messages.find((x) => x.id === m.reply_to) : undefined;
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-xs font-medium text-muted">
                    {day === today ? C.today : day === yesterday ? C.yesterday : formatDate(m.created_at, lang)}
                  </p>
                )}
                <MessageBubble
                  message={m}
                  mine={mine}
                  myOrg={myOrg}
                  sender={person ? { name: person.name, avatar_path: person.avatar_path, agency: person.agency } : null}
                  showSender={!sameRun}
                  time={timeOf(m.created_at)}
                  selected={selected === m.id}
                  reactions={[...counts.entries()]}
                  myReaction={(byMessage.get(m.id) ?? []).find((r) => r.profile_id === me)?.emoji ?? null}
                  quote={m.reply_to ? (answered ? { name: nameOf(answered.sender_id), text: messageLine(answered, t) } : { name: "", text: "…" }) : null}
                  canDelete={mine || (platformAdmin && kind === "brixa")}
                  onSelect={() => setSelected(selected === m.id ? null : m.id)}
                  onReact={(emoji) => void react(m, emoji)}
                  onReply={() => {
                    setSelected(null);
                    setReplyTo({ id: m.id, name: mine ? C.yourMessage : nameOf(m.sender_id), text: messageLine(m, t) });
                  }}
                  onDelete={() => {
                    if (!window.confirm(C.deleteConfirm)) return;
                    setSelected(null);
                    add({ ...m, deleted_at: new Date().toISOString(), body: null, card: null, file_path: null });
                    void deleteChatMessage(m.id);
                  }}
                  onSender={
                    !mine && kind !== "direct" && m.sender_id
                      ? () => {
                          const target = m.sender_id as string;
                          void startDirectChat(target).then((r) => r.id && router.push(`/chat/${r.id}`));
                        }
                      : null
                  }
                />
                {seen && lastMine?.id === m.id && <p className="mt-0.5 pr-1 text-right text-[11px] text-muted">{C.seen}</p>}
              </div>
            );
          })}
          {typers.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 px-10 text-xs text-muted">
              <span className="flex gap-0.5">
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted" />
              </span>
              {typers.length === 1 ? fmt(C.typing, { name: typers[0] }) : C.typingMany}
            </p>
          )}
        </div>

        <Composer
          room={room}
          me={me}
          myOrg={myOrg}
          shared={shared}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onTyping={sayTyping}
          onSent={(message) => {
            stick.current = true;
            add(message);
          }}
          onPickCard={(k) => setPicking(k)}
        />
      </div>

      {picking && <CardPicker room={room} kind={picking} myOrg={myOrg} onClose={() => setPicking(null)} />}
      {menu && (
        <RoomMenu
          room={room}
          kind={kind}
          title={kind === "group" ? title : null}
          muted={muted}
          shared={shared}
          people={people}
          colleagues={colleagues}
          onClose={() => setMenu(false)}
        />
      )}
    </div>
  );
}
