"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const TAP_OF = (href: string) =>
  href.startsWith("tel:")
    ? "call"
    : href.startsWith("viber:")
      ? "viber"
      : href.includes("wa.me/") || href.includes("whatsapp")
        ? "whatsapp"
        : href.startsWith("mailto:")
          ? "email"
          : null;

function beacon(body: object) {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/share/event", blob)) {
    void fetch("/api/share/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
  }
}

/**
 * Counts the opening once the page is really shown (link previews don't run this). On a shared
 * listing it also tells the broker how long the page was looked at, how many photos were seen and
 * the taps on call / Viber / WhatsApp / e-mail.
 */
export function ViewBeacon({ token, kind }: { token: string; kind: "listing" | "report" }) {
  useEffect(() => {
    const key = `brixa.viewed.${token}`;
    const read = (k: string) => {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const write = (k: string, v: string) => {
      try {
        sessionStorage.setItem(k, v);
      } catch {}
    };
    const fresh = !read(key);
    write(key, "1");

    if (kind === "report") {
      if (fresh) {
        void fetch("/api/share/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, kind }),
          keepalive: true,
        });
      }
      return;
    }

    // ---- a shared listing: the opening (once a visit), then the time and the photos
    let eventId = read(`${key}.event`);
    if (fresh) {
      void fetch("/api/share/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind }),
        keepalive: true,
      })
        .then((res) => (res.status === 200 ? res.json() : null))
        .then((data: { id?: string } | null) => {
          if (data?.id) {
            eventId = data.id;
            write(`${key}.event`, data.id);
          }
        })
        .catch(() => {});
    }

    let seconds = Number(read(`${key}.seconds`)) || 0;
    let since = document.visibilityState === "visible" ? Date.now() : null;
    const seen = new Set<Element>();
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) if (entry.isIntersecting) seen.add(entry.target);
            },
            { threshold: 0.6 }
          );
    document.querySelectorAll(".shared-photos img").forEach((img) => observer?.observe(img));

    const report = () => {
      if (since !== null) {
        seconds += (Date.now() - since) / 1000;
        since = null;
      }
      write(`${key}.seconds`, String(Math.round(seconds)));
      eventId ??= read(`${key}.event`);
      if (eventId) beacon({ token, id: eventId, seconds: Math.round(seconds), photos: seen.size });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") report();
      else since = Date.now();
    };
    // the taps on the broker's buttons
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const tap = link ? TAP_OF(link.getAttribute("href") ?? "") : null;
      if (tap) beacon({ token, kind: tap });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      document.removeEventListener("click", onClick, true);
      observer?.disconnect();
    };
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
