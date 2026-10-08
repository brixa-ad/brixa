"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, FileText, Handshake, Reply, Trash2, UserRound } from "lucide-react";
import { chatSharePhoto } from "@/app/(app)/chat/actions";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { CHAT_BUCKET, REACTIONS, duration, fileSize, systemText, type ChatMessage } from "@/lib/chat";
import { formatNumber, formatPrice } from "@/lib/format";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

// one signed address per file for the visit (an hour)
const signed = new Map<string, Promise<string | null>>();

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const key = `${bucket}/${path}`;
    let pending = signed.get(key);
    if (!pending) {
      pending = createClient()
        .storage.from(bucket)
        .createSignedUrl(path, 3600)
        .then((r) => r.data?.signedUrl ?? null);
      signed.set(key, pending);
    }
    void pending.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return url;
}

const shared = new Map<string, Promise<string | null>>();

/** The first photo of a listing another agency sent (through its public link). */
function useSharePhoto(token: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    let pending = shared.get(token);
    if (!pending) {
      pending = chatSharePhoto(token);
      shared.set(token, pending);
    }
    void pending.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [token]);
  return url;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Text with its web addresses as links. */
function Linked({ text, mine }: { text: string; mine: boolean }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        URL_RE.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className={`underline underline-offset-2 ${mine ? "" : "text-accent-fg"}`}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function Media({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useI18n();
  const url = useSignedUrl(CHAT_BUCKET, message.file_path);
  if (message.kind === "image") {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={message.file_name ?? ""} className="max-h-72 w-auto max-w-full rounded-xl object-cover" />
      </a>
    ) : (
      <span className="block h-40 w-56 max-w-full animate-pulse rounded-xl bg-raised" />
    );
  }
  if (message.kind === "voice") {
    return (
      <span className="flex min-w-0 flex-col gap-1">
        {url ? <audio controls preload="metadata" src={url} className="h-10 w-60 max-w-full" /> : <span className="h-10 w-60 max-w-full animate-pulse rounded-full bg-raised" />}
        <span className={`text-xs ${mine ? "text-on-accent/80" : "text-muted"}`}>
          {t.chat.voice} · {duration(message.duration_s)}
        </span>
      </span>
    );
  }
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={message.file_name ?? undefined}
      className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 ${mine ? "bg-white/15" : "bg-raised"}`}
    >
      <FileText className="size-6 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{message.file_name}</span>
        <span className={`block text-xs ${mine ? "text-on-accent/80" : "text-muted"}`}>
          {fileSize(message.file_size)} · {t.chat.download}
        </span>
      </span>
    </a>
  );
}

function Card({ message, mine, myOrg }: { message: ChatMessage; mine: boolean; myOrg: string }) {
  const { t, lang } = useI18n();
  const card = message.card ?? {};
  // the listing's own photo, for its agency (another agency sees the facts only)
  const ownAgency = message.organization_id === myOrg;
  const ownPhoto = useSignedUrl(PHOTO_BUCKET, ownAgency ? card.photo : null);
  // another agency's listing: its photo and its public page, through the link sent with it
  const sharedPhoto = useSharePhoto(!ownAgency && message.kind === "property" ? card.share : null);
  const photo = ownPhoto ?? sharedPhoto;
  const href =
    ownAgency && message.ref_id
      ? `/${message.kind === "property" ? "properties" : message.kind === "client" ? "clients" : "deals"}/${message.ref_id}`
      : message.kind === "property" && card.share
        ? `/p/${card.share}`
        : null;
  const Icon = message.kind === "property" ? Building2 : message.kind === "client" ? UserRound : Handshake;

  const lines: string[] = [];
  if (message.kind === "property") {
    lines.push(
      [card.price != null ? formatPrice(card.price, card.currency ?? "EUR", lang) : null, card.area ? `${formatNumber(card.area, lang)} ${t.units.sqm}` : null]
        .filter(Boolean)
        .join(" · ")
    );
    if (card.place) lines.push(card.place);
  } else if (message.kind === "client") {
    lines.push((card.types ?? []).map((x) => t.options.clientType[x as keyof typeof t.options.clientType] ?? x).join(", "));
    if (card.budget_max) lines.push(`≤ ${formatPrice(card.budget_max, card.currency ?? "EUR", lang)}`);
  } else {
    const stages = card.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
    lines.push([stages[card.stage as keyof typeof stages] ?? card.stage, card.client].filter(Boolean).join(" · "));
    if (card.price != null) lines.push(formatPrice(card.price, card.currency ?? "EUR", lang) ?? "");
  }

  const body = (
    <span className={`block w-64 max-w-full overflow-hidden rounded-xl border ${mine ? "border-white/25 bg-white/10" : "border-line bg-surface"}`}>
      {photo && <img src={photo} alt="" className="h-32 w-full object-cover" />}
      <span className="flex gap-2.5 p-3">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{card.title ?? card.name}</span>
          {lines.filter(Boolean).map((line) => (
            <span key={line} className={`block truncate text-xs ${mine ? "text-on-accent/85" : "text-muted"}`}>
              {line}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** One message: mine on the right, the others' on the left with who wrote it; tap it to react, reply or take it back. */
export function MessageBubble({
  message,
  mine,
  myOrg,
  sender,
  showSender,
  time,
  selected,
  reactions,
  myReaction,
  quote,
  canDelete,
  onSelect,
  onReact,
  onReply,
  onDelete,
  onSender,
}: {
  message: ChatMessage;
  mine: boolean;
  myOrg: string;
  sender: { name: string; avatar_path: string | null; agency: string | null } | null;
  /** the first of a run from the same person */
  showSender: boolean;
  time: string;
  selected: boolean;
  /** emoji → how many */
  reactions: [string, number][];
  myReaction: string | null;
  /** the message it answers */
  quote: { name: string; text: string } | null;
  canDelete: boolean;
  onSelect: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
  /** tapping someone's name or photo: a personal message */
  onSender: (() => void) | null;
}) {
  const { t } = useI18n();
  if (message.kind === "system") {
    return <p className="py-1 text-center text-xs text-muted">{systemText(message.body, t)}</p>;
  }
  const deleted = message.deleted_at !== null;
  const media = !deleted && (message.kind === "image" || message.kind === "file" || message.kind === "voice");
  const card = !deleted && (message.kind === "property" || message.kind === "client" || message.kind === "deal");

  return (
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${showSender ? "mt-3" : "mt-0.5"}`}>
      {!mine && (
        <span className="w-8 shrink-0">
          {showSender && (
            <button type="button" onClick={onSender ?? undefined} disabled={!onSender} aria-label={sender?.name}>
              <Avatar path={sender?.avatar_path} name={sender?.name ?? "?"} size="sm" />
            </button>
          )}
        </span>
      )}
      <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && showSender && (
          <button type="button" onClick={onSender ?? undefined} disabled={!onSender} className="mb-0.5 px-1 text-left text-xs font-medium text-muted">
            {sender?.name ?? "—"}
            {sender?.agency && <span className="text-brand-cyan"> · {sender.agency}</span>}
          </button>
        )}
        {quote && (
          <span className={`mb-0.5 max-w-full truncate rounded-xl border-l-2 border-accent bg-raised px-3 py-1 text-xs text-muted ${mine ? "self-end" : ""}`}>
            <span className="font-semibold text-fg-2">{quote.name}</span> {quote.text}
          </span>
        )}
        {/* tapping a message: react, reply, or take one's own back */}
        <div
          onClick={deleted ? undefined : onSelect}
          className={`relative min-w-0 max-w-full text-left ${deleted ? "cursor-default" : "cursor-pointer"} ${
            media && message.kind === "image"
              ? ""
              : `rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-surface text-fg ring-1 ring-line"}`
          }`}
        >
          {deleted ? (
            <span className={`text-sm italic ${mine ? "text-on-accent/80" : "text-muted"}`}>{t.chat.deleted}</span>
          ) : media ? (
            <Media message={message} mine={mine} />
          ) : card ? (
            <Card message={message} mine={mine} myOrg={myOrg} />
          ) : (
            <span className="whitespace-pre-wrap break-words text-[15px] leading-snug">
              <Linked text={message.body ?? ""} mine={mine} />
            </span>
          )}
        </div>
        {reactions.length > 0 && (
          <span className={`-mt-1.5 flex gap-0.5 rounded-full border border-line bg-surface px-1.5 py-0.5 text-xs shadow-xs ${mine ? "mr-2" : "ml-2"}`}>
            {reactions.map(([emoji, n]) => (
              <span key={emoji} className={emoji === myReaction ? "font-bold" : ""}>
                {emoji}
                {n > 1 && <span className="ml-0.5 text-muted">{n}</span>}
              </span>
            ))}
          </span>
        )}
        {selected && !deleted && (
          <span className="mt-1 flex flex-col rounded-2xl border border-line bg-surface p-1 shadow-sm">
            <span className="flex">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className={`grid size-9 place-items-center rounded-full text-lg transition hover:bg-raised ${emoji === myReaction ? "bg-accent-soft" : ""}`}
                  aria-label={`${t.chat.react} ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </span>
            <span className="flex gap-1 border-t border-line-soft px-1 pt-1">
              <button type="button" onClick={onReply} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-fg-2 hover:bg-raised">
                <Reply className="size-3.5" />
                {t.chat.reply}
              </button>
              {canDelete && (
                <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/10">
                  <Trash2 className="size-3.5" />
                  {t.chat.delete}
                </button>
              )}
            </span>
          </span>
        )}
        <span className="mt-0.5 px-1 text-[11px] text-subtle">{time}</span>
      </div>
    </div>
  );
}
