"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ClipboardList, History, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { confirmBrixAction } from "@/app/(app)/brix/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import type { ProposedAction } from "@/lib/brix/tools";
import { formatDate } from "@/lib/format";
import { BrixMarkdown } from "./BrixMarkdown";

type Message = {
  role: "user" | "assistant";
  content: string;
  actions?: (ProposedAction & { state?: "done" | "dismissed"; href?: string })[];
  error?: boolean;
};

const storageKey = (userId: string) => `brixa.brix.${userId}`;

function load(userId: string): Message[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Message[]).slice(-40) : [];
  } catch {
    return [];
  }
}

/** Chat with Brix. The conversation is kept on this device only. */
export function BrixChat({ userId, initialQuestion }: { userId: string; initialQuestion?: string }) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  // restore the conversation after the first render (localStorage isn't there on the server)
  useEffect(() => {
    void Promise.resolve().then(() => {
      setMessages(load(userId));
      setLoaded(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-40)));
    } catch {}
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loaded, userId]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/brix/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { reply?: string; actions?: ProposedAction[]; error?: string };
      if (!response.ok) {
        const message =
          data.error === "not_configured" ? t.brix.notConfigured : data.error === "limit" ? t.brix.limit : t.brix.failed;
        setMessages((m) => [...m, { role: "assistant", content: message, error: true }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply || "…", actions: data.actions ?? [] }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: t.brix.failed, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  // "Ask Brix" links can bring a question along (?q=…)
  useEffect(() => {
    if (!loaded || asked.current || !initialQuestion) return;
    asked.current = true;
    void Promise.resolve().then(() => send(initialQuestion));
  });

  async function act(messageIndex: number, actionIndex: number, confirm: boolean) {
    const action = messages[messageIndex].actions?.[actionIndex];
    if (!action) return;
    const update = (patch: { state: "done" | "dismissed"; href?: string }) =>
      setMessages((m) =>
        m.map((msg, i) =>
          i === messageIndex
            ? { ...msg, actions: msg.actions?.map((a, j) => (j === actionIndex ? Object.assign({}, a, patch) : a)) }
            : msg
        )
      );
    if (!confirm) return update({ state: "dismissed" });
    const result = await confirmBrixAction(action);
    if (result.ok) update({ state: "done", href: result.href });
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
              {t.brix.hello}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {t.brix.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-sm text-fg-2 transition hover:border-accent hover:text-accent-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) =>
          message.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-on-accent">
                {message.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-brand-cyan text-white">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 max-w-[85%] space-y-2">
                <div
                  className={`rounded-2xl rounded-tl-md border px-4 py-3 ${
                    message.error ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-surface"
                  }`}
                >
                  <BrixMarkdown text={message.content} />
                </div>
                {message.actions?.map((action, j) => (
                  <div key={j} className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-fg">
                      {action.kind === "task" ? <ClipboardList className="size-3.5" /> : <History className="size-3.5" />}
                      {action.kind === "task" ? t.brix.actionTask : t.brix.actionActivity}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {action.kind === "task" ? action.title : t.options.activityType[action.type]}
                    </p>
                    <p className="text-xs text-muted">
                      {[
                        action.kind === "task" &&
                          `${formatDate(action.dueDate, lang)}${action.dueTime ? `, ${action.dueTime}` : ""}`,
                        action.clientName,
                        action.propertyTitle,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {action.kind === "activity" && action.note && <p className="mt-1 text-sm text-fg-2">{action.note}</p>}
                    <div className="mt-2.5 flex items-center gap-2">
                      {action.state === "done" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                          <Check className="size-4" />
                          {action.href ? (
                            <Link href={action.href} className="hover:underline">
                              {t.brix.confirmed}
                            </Link>
                          ) : (
                            t.brix.confirmed
                          )}
                        </span>
                      ) : action.state === "dismissed" ? (
                        <span className="text-sm text-muted">{t.brix.dismissed}</span>
                      ) : (
                        <>
                          <ActionButton onClick={() => act(i, j, true)} label={t.brix.confirm} primary />
                          <ActionButton onClick={() => act(i, j, false)} label={t.brix.dismiss} />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {busy && (
          <p className="flex items-center gap-2 pl-11 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            {t.brix.thinking}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-end gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-lg backdrop-blur md:bottom-4"
      >
        <textarea
          value={draft}
          rows={1}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder={t.brix.placeholder}
          aria-label={t.brix.placeholder}
          className={`${inputClass} max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus:ring-0`}
        />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            title={t.brix.clear}
            aria-label={t.brix.clear}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-raised hover:text-fg"
          >
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label={t.brix.send}
          className={`${buttonClass.primary} size-10 shrink-0 rounded-xl p-0!`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
    </div>
  );
}

function ActionButton({ onClick, label, primary = false }: { onClick: () => Promise<void> | void; label: string; primary?: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await onClick();
        setPending(false);
      }}
      className={`${primary ? buttonClass.primary : buttonClass.ghost} px-3! py-1.5! text-xs!`}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : primary ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {label}
    </button>
  );
}
