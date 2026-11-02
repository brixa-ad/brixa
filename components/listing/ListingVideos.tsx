"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { PLATFORM_NAMES, videoLink } from "@/lib/video";

/** Tells the page's counter that the video was played (a shared link's or the website's visit). */
const played = () => window.dispatchEvent(new Event("brixa:video"));

/**
 * The listing's videos: its own (played in the page) and the links — a link's player is loaded only
 * when tapped, so nothing comes from YouTube, TikTok… before that.
 */
export function ListingVideos({ file, links }: { file: string | null; links: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const videos = links.map(videoLink).filter((v): v is NonNullable<typeof v> => Boolean(v));
  if (!file && videos.length === 0) return null;

  return (
    <div className="space-y-3">
      {file && (
        <video
          src={file}
          controls
          playsInline
          preload="metadata"
          onPlay={played}
          className="max-h-[75vh] w-full rounded-2xl bg-black"
        />
      )}
      {videos.map((v) =>
        open === v.url && v.embed ? (
          <div key={v.url} className={`overflow-hidden rounded-2xl bg-black ${v.tall ? "mx-auto aspect-[9/16] max-h-[80vh] max-w-sm" : "aspect-video w-full"}`}>
            <iframe
              src={v.embed}
              title={PLATFORM_NAMES[v.platform] || t.video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="size-full border-0"
            />
          </div>
        ) : (
          <div key={v.url} className="flex items-center gap-2">
            {v.embed ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(v.url);
                  played();
                }}
                className="inline-flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3 text-left text-sm font-semibold transition hover:border-line-strong"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                  <Play className="size-4 translate-x-px" />
                </span>
                <span className="truncate">{fmt(t.video.watchOn, { platform: PLATFORM_NAMES[v.platform] })}</span>
              </button>
            ) : (
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={played}
                className="inline-flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3 text-sm font-semibold transition hover:border-line-strong"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                  <Play className="size-4 translate-x-px" />
                </span>
                <span className="truncate">
                  {v.platform === "other" ? new URL(v.url).hostname.replace(/^www\./, "") : fmt(t.video.watchOn, { platform: PLATFORM_NAMES[v.platform] })}
                </span>
              </a>
            )}
            {v.embed && (
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.video.open}
                title={t.video.open}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:text-fg"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        )
      )}
    </div>
  );
}
