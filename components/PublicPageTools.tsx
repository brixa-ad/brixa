"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/** Counts the opening once the page is really shown (link previews don't run this). */
export function ViewBeacon({ token, kind }: { token: string; kind: "listing" | "report" }) {
  useEffect(() => {
    const key = `brixa.viewed.${token}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    void fetch("/api/share/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind }),
      keepalive: true,
    });
  }, [token, kind]);
  return null;
}

/** "PDF / Print" — the browser saves the page as a PDF. */
export function PrintButton({ label }: { label?: string } = {}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-fg-2 transition hover:bg-raised"
    >
      <Printer className="size-4" />
      {label ?? t.share.print}
    </button>
  );
}
