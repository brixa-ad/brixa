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

function beacon(body: object, url = "/api/share/event") {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  if (!navigator.sendBeacon?.(url, blob)) {
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
  }
}

const readStored = (store: () => Storage, k: string) => {
  try {
    return store().getItem(k);
  } catch {
    return null;
  }
};
const writeStored = (store: () => Storage, k: string, v: string) => {
  try {
    store().setItem(k, v);
  } catch {}
};
const session = () => sessionStorage;

type Seen = { seconds: number; photos: number; video: boolean };

/**
 * How the page is looked at: the seconds it is on screen, the photos seen (60% in view), whether the
 * video was played — told to `send` each time the page is hidden or left. Returns the cleanup.
 */
function watchLooking(key: string, send: (seen: Seen) => void) {
  let seconds = Number(readStored(session, `${key}.seconds`)) || 0;
  let video = readStored(session, `${key}.video`) === "1";
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
  document.querySelectorAll(".listing-photo, .shared-photos img").forEach((img) => observer?.observe(img));

  const report = () => {
    if (since !== null) {
      seconds += (Date.now() - since) / 1000;
      since = null;
    }
    writeStored(session, `${key}.seconds`, String(Math.round(seconds)));
    send({ seconds: Math.round(seconds), photos: seen.size, video });
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") report();
    else since = Date.now();
  };
  // the listing's video was played (ListingVideos)
  const onVideo = () => {
    video = true;
    writeStored(session, `${key}.video`, "1");
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", report);
  window.addEventListener("brixa:video", onVideo);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", report);
    window.removeEventListener("brixa:video", onVideo);
    observer?.disconnect();
  };
}

/**
 * Counts the opening once the page is really shown (link previews don't run this). On a shared
 * listing it also tells the broker how long the page was looked at, how many photos were seen and
 * the taps on call / Viber / WhatsApp / e-mail.
 */
export function ViewBeacon({ token, kind }: { token: string; kind: "listing" | "report" | "analysis" }) {
  useEffect(() => {
    const key = `brixa.viewed.${token}`;
    const read = (k: string) => readStored(session, k);
    const write = (k: string, v: string) => writeStored(session, k, v);
    const fresh = !read(key);
    write(key, "1");

    if (kind === "report" || kind === "analysis") {
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

    // ---- a shared listing: the opening (once a visit), then the time, the photos and the video
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

    const stop = watchLooking(key, (seen) => {
      eventId ??= read(`${key}.event`);
      if (eventId) beacon({ token, id: eventId, ...seen });
    });
    // the taps on the broker's buttons
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const tap = link ? TAP_OF(link.getAttribute("href") ?? "") : null;
      if (tap) beacon({ token, kind: tap });
    };

    document.addEventListener("click", onClick, true);
    return () => {
      stop();
      document.removeEventListener("click", onClick, true);
    };
  }, [token, kind]);
  return null;
}

/**
 * The agency's website: counts a visit of a listing (one per browser in 12 hours — a random id kept
 * here, nothing about the person), how long it was looked at, the photos seen and the video.
 */
export function SiteBeacon({ site, propertyId }: { site: string; propertyId: string }) {
  useEffect(() => {
    const local = () => localStorage;
    let visitor = readStored(local, "brixa.visitor");
    if (!visitor) {
      visitor = crypto.randomUUID();
      writeStored(local, "brixa.visitor", visitor);
    }
    const key = `brixa.site.${propertyId}`;
    let viewId = readStored(session, `${key}.view`);
    if (!viewId) {
      void fetch("/api/site/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, property: propertyId, visitor }),
        keepalive: true,
      })
        .then((res) => (res.status === 200 ? res.json() : null))
        .then((data: { id?: string } | null) => {
          if (data?.id) {
            viewId = data.id;
            writeStored(session, `${key}.view`, data.id);
          }
        })
        .catch(() => {});
    }
    return watchLooking(key, (seen) => {
      if (viewId) beacon({ id: viewId, visitor, ...seen }, "/api/site/event");
    });
  }, [site, propertyId]);
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
