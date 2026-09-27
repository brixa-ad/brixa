"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { BrixMarkdown } from "./BrixMarkdown";

/** Brix's plan for the day at the top of the home screen (written on the first visit of the day). */
export function MorningBrief({ initial }: { initial: string | null }) {
  const { t } = useI18n();
  const [content, setContent] = useState(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "hidden" | "failed">(initial ? "idle" : "loading");
  const started = useRef(false);

  async function load(refresh: boolean) {
    setStatus("loading");
    try {
      const response = await fetch(`/api/brix/brief${refresh ? "?refresh=1" : ""}`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { content?: string; error?: string };
      if (response.ok && data.content) {
        setContent(data.content);
        setStatus("idle");
      } else {
        // Not connected yet → no card at all; otherwise keep yesterday's-style quiet failure
        setStatus(data.error === "not_configured" ? "hidden" : "failed");
      }
    } catch {
      setStatus("failed");
    }
  }

  useEffect(() => {
    if (started.current || initial) return;
    started.current = true;
    void load(false);
  });

  if (status === "hidden" || (status === "failed" && !content)) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/60 via-surface to-surface p-5 shadow-xs sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-accent to-brand-cyan text-white">
            <Sparkles className="size-3.5" />
          </span>
          {t.brix.briefTitle}
        </h2>
        {content && status !== "loading" && (
          <button
            type="button"
            onClick={() => load(true)}
            title={t.brix.briefRefresh}
            aria-label={t.brix.briefRefresh}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
          >
            <RefreshCw className="size-4" />
          </button>
        )}
      </header>

      {status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t.brix.briefLoading}
        </p>
      ) : (
        content && <BrixMarkdown text={content} />
      )}

      <Link href="/brix" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
        <MessageCircle className="size-4" />
        {t.brix.ask}
      </Link>
    </section>
  );
}
