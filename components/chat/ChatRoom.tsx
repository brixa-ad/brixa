"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellOff, Building2, Globe, MoreVertical } from "lucide-react";
import { deleteChatMessage, markChatRead } from "@/app/(app)/chat/actions";
import { useI18n } from "@/components/I18nProvider";
import { MESSAGE_COLUMNS, type ChatMessage } from "@/lib/chat";
import { sofiaDay, sofiaToday, addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { CardPicker } from "./CardPicker";
import { Composer, type CardKind } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import type { Colleague } from "./NewChat";
import { RoomMenu, type RoomPerson } from "./RoomMenu";

const PAGE = 60;

const byTime = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at);

/** One conversation: its messages (new ones come at once), and writing at the bottom. */
export function ChatRoom({
  room,
  kind,
  title,
  subtitle,
  muted,
  shared,
  me,
  myOrg,
  people,
  colleagues,
  initial,
}: {
  room: string;
  kind: "agency" | "group";
  title: string;
  subtitle: string;
  muted: boolean;
  shared: boolean;
  me: string;
  myOrg: string;
  people: RoomPerson[];
  colleagues: Colleague[];
  initial: ChatMessage[];
}) {
  const { t, lang } = useI18n();
  const C = t.chat;
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [more, setMore] = useState(initial.length >= PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<CardKind | null>(null);
  const [menu, setMenu] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const keepFrom = useRef<number | null>(null);

  const read = useCallback(() => {
    void markChatRead(room).then(() => window.dispatchEvent(new Event("brixa:chat-read")));
  }, [room]);

  const add = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const at = current.findIndex((m) => m.id === message.id);
      if (at >= 0) {
        const next = current.slice();
        next[at] = message;
        return next;
      }
      return [...current, message].sort(byTime);
    });
  }, []);

  // read on opening; new messages and taken-back ones come by themselves
  useEffect(() => {
    read();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`chat:${room}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${room}` }, (payload) => {
        const message = payload.new as ChatMessage;
        if (!message?.id) return;
        add(message);
        if (payload.eventType === "INSERT" && message.sender_id !== me && document.visibilityState === "visible") {
          clearTimeout(timer);
          timer = setTimeout(read, 800);
        }
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const { data } = await createClient()
      .from("chat_messages")
      .select(MESSAGE_COLUMNS)
      .eq("room_id", room)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const older = ((data ?? []) as ChatMessage[]).reverse();
    setMore(older.length >= PAGE);
    if (list.current) keepFrom.current = list.current.scrollHeight - list.current.scrollTop;
    setMessages((current) => [...older.filter((m) => !current.some((c) => c.id === m.id)), ...current]);
  }

  const who = new Map(people.map((p) => [p.id, p]));
  const today = sofiaToday();
  const yesterday = addDays(today, -1);
  const timeOf = (iso: string) => new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(iso));

  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 bg-canvas">
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <header className="flex items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
          <Link href="/chat" className="grid size-10 shrink-0 place-items-center rounded-full text-fg-2 transition hover:bg-raised" aria-label={C.title}>
            <ArrowLeft className="size-5" />
          </Link>
          {kind === "agency" && <Building2 className="size-5 shrink-0 text-accent-fg" />}
          <button type="button" onClick={() => setMenu(true)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold">{title}</span>
              {shared && <Globe className="size-3.5 shrink-0 text-brand-cyan" />}
              {muted && <BellOff className="size-3.5 shrink-0 text-subtle" />}
            </span>
            <span className="block truncate text-xs text-muted">{subtitle}</span>
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
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-xs font-medium text-muted">
                    {day === today ? C.today : day === yesterday ? C.yesterday : formatDate(m.created_at, lang)}
                  </p>
                )}
                <MessageBubble
                  message={m}
                  mine={m.sender_id === me}
                  myOrg={myOrg}
                  sender={person ? { name: person.name, avatar_path: person.avatar_path, agency: person.agency } : null}
                  showSender={!sameRun}
                  time={timeOf(m.created_at)}
                  selected={selected === m.id}
                  onSelect={() => setSelected(selected === m.id ? null : m.id)}
                  onDelete={() => {
                    if (!window.confirm(C.deleteConfirm)) return;
                    setSelected(null);
                    add({ ...m, deleted_at: new Date().toISOString(), body: null, card: null, file_path: null });
                    void deleteChatMessage(m.id);
                  }}
                />
              </div>
            );
          })}
        </div>

        <Composer
          room={room}
          me={me}
          myOrg={myOrg}
          shared={shared}
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
