"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Copy, Loader2, Megaphone, Route, Share2, Sparkles } from "lucide-react";
import { addPlanTasks } from "@/app/(app)/properties/marketing-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { useMounted } from "@/components/ui/Modal";
import { addDays } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";

type Posts = { facebook: string; instagram: string; hashtags: string[]; colleagues: string };
type Step = { day: number; channel: string; action: string; why: string; kind: string };
type Plan = { summary: string; price: { action: "keep" | "lower" | "raise"; price_eur: number; after_days: number; why: string }; steps: Step[] };

/**
 * Brix for the listing's marketing: the posts ready to copy — or to share with the photos in one
 * tap from the phone — and a selling plan whose steps become tasks.
 */
export function BrixMarketing({ propertyId, photoUrls }: { propertyId: string; photoUrls: string[] }) {
  const { t, lang } = useI18n();
  const M = t.brixMarketing;
  const mounted = useMounted();
  const [busy, setBusy] = useState<"posts" | "plan" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Posts | null>(null);
  const [plan, setPlan] = useState<{ plan: Plan; today: string } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [said, setSaid] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // the photos, loaded once the posts are there: the share sheet has to open right on the tap (iPhone)
  const files = useRef<File[]>([]);
  useEffect(() => {
    if (!posts || files.current.length || photoUrls.length === 0) return;
    void Promise.all(
      photoUrls.slice(0, 10).map(async (url, i) => {
        const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
        return blob ? new File([blob], `brixa-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }) : null;
      })
    ).then((loaded) => {
      files.current = loaded.filter((f): f is File => Boolean(f));
    });
  }, [posts, photoUrls]);

  async function ask(kind: "posts" | "plan") {
    setBusy(kind);
    setError(null);
    setSaid(null);
    try {
      const response = await fetch("/api/brix/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, kind }),
      });
      const data = (await response.json().catch(() => ({}))) as { result?: unknown; today?: string; error?: string };
      if (!response.ok || !data.result) {
        setError(data.error === "limit" ? t.brix.limit : data.error === "not_configured" ? t.brix.notConfigured : t.brix.failed);
      } else if (kind === "posts") {
        setPosts(data.result as Posts);
      } else {
        const p = data.result as Plan;
        setPlan({ plan: p, today: data.today ?? new Date().toISOString().slice(0, 10) });
        setPicked(new Set(p.steps.map((_, i) => i)));
      }
    } catch {
      setError(t.brix.failed);
    }
    setBusy(null);
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2500);
    } catch {}
  }

  /** The phone's share sheet with the photos and the text (the text is also copied: Instagram drops it). */
  async function share(key: string, text: string) {
    // the text copied first (Instagram drops what's shared with the photos) — not awaited: the sheet opens on the tap
    void copy(key, text);
    try {
      const ready = files.current;
      if (ready.length && navigator.canShare?.({ files: ready })) await navigator.share({ files: ready, text });
      else await navigator.share({ text });
    } catch {
      // cancelled, or the browser can't share
    }
  }

  const canShare = mounted && "share" in navigator;
  const box = "rounded-xl border border-line bg-raised/40 p-3";
  const small = `${buttonClass.secondary} px-2.5! py-1! text-xs!`;
  const block = (id: string, title: string, text: string) => (
    <div key={id} className={box}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => copy(id, text)} className={small}>
            {copied === id ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied === id ? M.copied : M.copy}
          </button>
          {canShare && (
            <button type="button" onClick={() => share(id, text)} className={`${buttonClass.primary} px-2.5! py-1! text-xs!`}>
              <Share2 className="size-3.5" />
              {photoUrls.length ? M.shareWithPhotos : M.share}
            </button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-line text-sm text-fg-2">{text}</p>
    </div>
  );

  const priceText = plan
    ? plan.plan.price.action === "keep"
      ? M.priceKeep
      : fmt(plan.plan.price.action === "lower" ? M.priceLower : M.priceRaise, {
          price: formatPrice(plan.plan.price.price_eur, "EUR", lang) ?? "",
          date: formatDate(addDays(plan.today, plan.plan.price.after_days), lang),
        })
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => ask("posts")} className={buttonClass.primary}>
          {busy === "posts" ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
          {posts ? M.postsAgain : M.posts}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => ask("plan")} className={buttonClass.secondary}>
          {busy === "plan" ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
          {plan ? M.planAgain : M.plan}
        </button>
      </div>
      {busy && <p className="flex items-center gap-2 text-sm text-muted"><Sparkles className="size-4 animate-pulse text-brand-cyan" />{M.working}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {posts && (
        <div className="space-y-3">
          {block("fb", "Facebook", posts.facebook)}
          {block("ig", "Instagram", `${posts.instagram}\n\n${posts.hashtags.map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`).join(" ")}`)}
          {block("groups", M.groups, posts.colleagues)}
          {canShare && <p className="text-xs text-muted">{M.shareHint}</p>}
        </div>
      )}

      {plan && (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">{plan.plan.summary}</p>
          <div className={`${box} border-accent/30`}>
            <p className="text-sm font-semibold">{priceText}</p>
            <p className="mt-0.5 text-xs text-muted">{plan.plan.price.why}</p>
          </div>
          <ul className="space-y-1">
            {plan.plan.steps.map((step, i) => {
              const on = picked.has(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setPicked((p) => { const n = new Set(p); if (on) n.delete(i); else n.add(i); return n; })}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-raised"
                  >
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${on ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="w-20 shrink-0 text-xs font-semibold text-accent-fg">{formatDate(addDays(plan.today, step.day), lang)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{step.action}</span>
                      <span className="block text-xs text-muted">{step.channel} · {step.why}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={adding || picked.size === 0}
            onClick={async () => {
              setAdding(true);
              const result = await addPlanTasks(propertyId, plan.plan.steps.filter((_, i) => picked.has(i)));
              setAdding(false);
              setSaid(result.ok ? fmt(M.added, { count: result.added }) : t.errors.generic);
            }}
            className={buttonClass.primary}
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            {fmt(M.addTasks, { count: picked.size })}
          </button>
          {said && <p className="text-sm text-success">{said}</p>}
        </div>
      )}
    </div>
  );
}
