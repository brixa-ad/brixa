"use client";

import { useEffect } from "react";
import { ExternalLink, Play, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { PLATFORM_NAMES, videoLink, type VideoLink } from "@/lib/video";

/** Tells the page's counter that the video was played (a shared link's or the website's visit). */
export const played = () => window.dispatchEvent(new Event("brixa:video"));

/** One video among the listing's photos: its own file, or a link to where it's posted. */
export type ListingVideo = { kind: "file"; url: string } | { kind: "link"; link: VideoLink };

/** The listing's videos as slides: its own first, then the links that are web addresses. */
export function listingVideos(media: { file: string | null; links: string[] } | undefined): ListingVideo[] {
  if (!media) return [];
  return [
    ...(media.file ? [{ kind: "file" as const, url: media.file }] : []),
    ...media.links.map(videoLink).flatMap((link) => (link ? [{ kind: "link" as const, link }] : [])),
  ];
}

/** "Гледай в YouTube" — or the site's name for a link it can't play in the page. */
function linkLabel(link: VideoLink, watchOn: string) {
  return link.platform === "other" ? new URL(link.url).hostname.replace(/^www\./, "") : fmt(watchOn, { platform: PLATFORM_NAMES[link.platform] });
}

/**
 * A video's slide among the photos. The own video plays right there; a link shows a play button
 * and its player opens over the page when tapped (nothing is loaded from YouTube, TikTok… before that).
 */
export function VideoSlide({ video, onOpen }: { video: ListingVideo; onOpen: (link: VideoLink) => void }) {
  const { t } = useI18n();
  if (video.kind === "file") {
    // "#t=0.1": the phones show its first frame instead of black
    return <video src={`${video.url}#t=0.1`} controls playsInline preload="metadata" onPlay={played} className="size-full bg-black object-contain" />;
  }
  const { link } = video;
  const face = (
    <>
      <span className="grid size-16 place-items-center rounded-full bg-white/90 text-black shadow-lg transition group-hover:scale-105">
        <Play className="size-7 translate-x-0.5 fill-current" />
      </span>
      <span className="max-w-[80%] truncate text-base font-semibold">{linkLabel(link, t.video.watchOn)}</span>
    </>
  );
  const look = "group flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-white";
  return link.embed ? (
    <button
      type="button"
      onClick={() => {
        played();
        onOpen(link);
      }}
      className={look}
    >
      {face}
    </button>
  ) : (
    <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={played} className={look}>
      {face}
    </a>
  );
}

/** A link's player over the page: upright for TikTok, Reels, Shorts; wide for the others. */
export function VideoPlayer({ link, onClose }: { link: VideoLink; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = keep;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const round = "grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25";
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black p-3 pt-[calc(3.75rem+env(safe-area-inset-top))]" role="dialog" aria-modal="true">
      <div className={link.tall ? "aspect-[9/16] h-full max-h-full max-w-full" : "aspect-video w-full max-w-5xl"}>
        <iframe
          src={link.embed!}
          title={PLATFORM_NAMES[link.platform] || t.video.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="size-full rounded-xl border-0 bg-black"
        />
      </div>
      <div className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex gap-2">
        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t.video.open} title={t.video.open} className={round}>
          <ExternalLink className="size-5" />
        </a>
        <button type="button" onClick={onClose} aria-label={t.common.cancel} title={t.common.cancel} className={round}>
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
