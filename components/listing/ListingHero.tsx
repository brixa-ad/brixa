"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { FullScreen } from "@/components/property/PhotoGallery";
import type { Photo } from "@/lib/types";

/**
 * A listing's photos at the top, the way the portals open a listing: edge to edge on the phone,
 * swipe through them (tap: full screen), the counter, and whatever floats on them (back, share, badges).
 */
export function ListingHero({
  photos,
  topLeft,
  topRight,
  bottomLeft,
  photoClass = "",
}: {
  photos: Photo[];
  /** a class on each photo (the shared page counts the photos seen) */
  photoClass?: string;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
}) {
  const { t } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const closeFull = useCallback(() => setFull(null), []);
  const shown = photos.filter((p) => p.url);
  const go = (step: number) => {
    const el = strip.current;
    if (!el) return;
    const next = (index + step + shown.length) % shown.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const float = "grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65";

  return (
    <div className="relative -mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-3xl">
      <div className="aspect-[4/3] sm:aspect-[16/9]">
        {shown.length === 0 ? (
          <div className="grid size-full place-items-center bg-raised text-subtle">
            <span className="flex flex-col items-center gap-2">
              <ImageIcon className="size-8" />
              <span className="text-sm">{t.photos.none}</span>
            </span>
          </div>
        ) : (
          <div
            ref={strip}
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
            className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          >
            {shown.map((photo, i) => (
              <button key={photo.id} type="button" onClick={() => setFull(i)} className="size-full shrink-0 snap-center cursor-zoom-in" aria-label={`${i + 1} / ${shown.length}`}>
                <img src={photo.url!} alt="" loading={i === 0 ? "eager" : "lazy"} className={`size-full object-cover ${photoClass}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* what floats on the photo */}
      {topLeft && <div className="absolute left-3 top-3 flex gap-2">{topLeft}</div>}
      {topRight && <div className="absolute right-3 top-3 flex gap-2">{topRight}</div>}
      {bottomLeft && <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">{bottomLeft}</div>}
      {shown.length > 1 && (
        <>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
            {index + 1} / {shown.length}
          </span>
          <button type="button" onClick={() => go(-1)} aria-label="‹" className={`${float} absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="›" className={`${float} absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {full !== null && <FullScreen photos={shown} startAt={full} onClose={closeFull} />}
    </div>
  );
}
