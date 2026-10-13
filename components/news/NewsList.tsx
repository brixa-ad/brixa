"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { CheckCircle2, FileDown, HeartCrack, Landmark, Lightbulb, Loader2, MapPinned, Newspaper, Phone, PhoneCall, Share2, TrendingUp, X } from "lucide-react";
import { settleNews } from "@/app/(app)/follow-up/actions";
import { useI18n } from "@/components/I18nProvider";
import { MessageSender } from "@/components/program/MessageSender";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { telHref } from "@/lib/phone";
import { newsHasPdf, type NewsKind } from "@/lib/news";

export type NewsItem = {
  id: string;
  clientId: string;
  name: string;
  phone: string | null;
  email: string | null;
  kind: NewsKind;
  title: string;
  date: string;
  text: string;
};

const ICONS = {
  rates: Landmark,
  prices: TrendingUp,
  monthly: Newspaper,
  warm_analysis: MapPinned,
  warm_rates: Landmark,
  warm_call: PhoneCall,
  tips: Lightbulb,
  breakup: HeartCrack,
} as const;

/** The market news ready to send: each with its text, sent in one tap (or left out). */
export function NewsList({ items }: { items: NewsItem[] }) {
  const { t } = useI18n();
  // kept as they were: one sent stays on the list, marked, until the page is opened again
  const [list] = useState(items);

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
        <Newspaper className="mx-auto size-10 text-faint" />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">{t.news.empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t.news.sendHint}</p>
      <ul className="space-y-3">
        {list.map((item) => (
          <NewsRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

// only phones (and some browsers) can share a file
const canShareFiles = () => {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
};
const noSubscription = () => () => {};

/** The message as a document: download it, or share the file straight from the phone. */
function PdfButtons({ id, name, onShared }: { id: string; name: string; onShared: () => void }) {
  const { t } = useI18n();
  const href = `/api/client-news/${id}/pdf`;
  const canShare = useSyncExternalStore(noSubscription, canShareFiles, () => false);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const blob = await (await fetch(href)).blob();
      const file = new File([blob], `${name.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 100)}.pdf`, { type: "application/pdf" });
      await navigator.share({ files: [file], title: name });
      onShared();
    } catch {
      // closed the share sheet
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a href={href} className={buttonClass.secondary}>
        <FileDown className="size-4" />
        {t.newsPdf.download}
      </a>
      {canShare && (
        <button type="button" disabled={busy} onClick={share} className={buttonClass.secondary}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          {t.newsPdf.share}
        </button>
      )}
    </div>
  );
}

export function NewsRow({ item }: { item: NewsItem }) {
  const { t } = useI18n();
  const [done, setDone] = useState<"sent" | "skipped" | null>(null);
  const [pending, startTransition] = useTransition();
  const Icon = ICONS[item.kind];

  const settle = (sent: boolean, text = item.text) =>
    startTransition(async () => {
      // the lane's call goes into the history as a call
      const result =
        item.kind === "warm_call"
          ? await settleNews(item.id, sent, t.news.warmCallLog, "call")
          : await settleNews(item.id, sent, fmt(t.news.logNote, { title: item.title, text }));
      if (result.ok) setDone(sent ? "sent" : "skipped");
    });

  return (
    <li className={`rounded-2xl border border-line bg-surface p-4 shadow-xs ${done ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-fg">
          <Icon className="size-3.5" />
          {item.title}
        </span>
        <Link href={`/clients/${item.clientId}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent-fg">
          {item.name}
        </Link>
        <span className="text-xs text-muted">{item.date}</span>
      </div>

      {done ? (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${done === "sent" ? "text-success" : "text-muted"}`}>
          {done === "sent" ? <CheckCircle2 className="size-4" /> : <X className="size-4" />}
          {done === "sent" ? t.news.sent : t.news.skipped}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {item.kind === "warm_call" ? (
            // a call: what to say, and the button that calls
            <div className="space-y-2.5">
              <p className="rounded-xl bg-raised/60 p-3 text-sm leading-relaxed text-fg-2">{item.text}</p>
              {item.phone ? (
                <a href={telHref(item.phone)} onClick={() => settle(true)} className={`${buttonClass.primary} w-full`}>
                  <Phone className="size-4" />
                  {t.news.call}
                </a>
              ) : (
                <button type="button" disabled={pending} onClick={() => settle(true)} className={`${buttonClass.secondary} w-full`}>
                  <CheckCircle2 className="size-4" />
                  {t.news.called}
                </button>
              )}
            </div>
          ) : (
            <MessageSender text={item.text} phone={item.phone} email={item.email} onSend={(text) => settle(true, text)} />
          )}
          {newsHasPdf(item.kind) && <PdfButtons id={item.id} name={`${item.title} - ${item.name}`} onShared={() => settle(true)} />}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => settle(false)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:bg-raised hover:text-fg"
            >
              <X className="size-4" />
              {t.news.skip}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
