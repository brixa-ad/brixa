"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { Photo } from "@/lib/types";

/** The photos on full screen: swipe through them, whole (not cut), on black. */
export function FullScreen({ photos, startAt, onClose }: { photos: Photo[]; startAt: number; onClose: () => void }) {
  const { t } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startAt);

  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = startAt * el.clientWidth;
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const step = event.key === "ArrowRight" ? 1 : -1;
        el?.scrollBy({ left: step * el.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = keep;
      window.removeEventListener("keydown", onKey);
    };
  }, [startAt, onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-black" role="dialog" aria-modal="true">
      <div
        ref={strip}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {photos.map((photo) => (
          <div key={photo.id} className="grid h-full w-full shrink-0 snap-center place-items-center">
            {photo.url && <img src={photo.url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.cancel}
        className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
      >
        <X className="size-5" />
      </button>
      {photos.length > 1 && (
        <span className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur">
          {index + 1} / {photos.length}
        </span>
      )}
    </div>
  );
}

/**
 * A listing's photos. On a phone: swipe through them (each fills the width), tap for full screen.
 * On a computer: the big photo with arrows and the thumbnails under it.
 */
export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [swiped, setSwiped] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const closeFull = useCallback(() => setFull(null), []);

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[16/9] place-items-center rounded-2xl border border-line bg-raised text-subtle">
        <div className="flex flex-col items-center gap-2">
          <ImageIcon className="size-8" />
          <span className="text-sm">{t.photos.none}</span>
        </div>
      </div>
    );
  }

  const current = photos[Math.min(index, photos.length - 1)];
  const go = (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <div className="space-y-3">
      {/* ---- the phone: swipe, tap for full screen ---- */}
      <div className="relative sm:hidden">
        <div
          onScroll={(e) => setSwiped(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-black [scrollbar-width:none]"
        >
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setFull(i)}
              aria-label={`${i + 1} / ${photos.length}`}
              className="aspect-[4/3] w-full shrink-0 snap-center"
            >
              {photo.url && <img src={photo.url} alt="" loading={i === 0 ? "eager" : "lazy"} className="size-full object-cover" />}
            </button>
          ))}
        </div>
        {photos.length > 1 && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            {swiped + 1} / {photos.length}
          </span>
        )}
      </div>

      {/* ---- the computer: the big photo, the arrows, the thumbnails ---- */}
      <div className="hidden space-y-3 sm:block">
        <div className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-black">
          {current.url && (
            <button type="button" onClick={() => setFull(index)} className="size-full cursor-zoom-in" aria-label={`${index + 1} / ${photos.length}`}>
              <img src={current.url} alt="" className="size-full object-contain" />
            </button>
          )}

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous"
                className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow backdrop-blur transition hover:bg-black/75"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next"
                className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow backdrop-blur transition hover:bg-black/75"
              >
                <ChevronRight className="size-5" />
              </button>
              <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {index + 1} / {photos.length}
              </span>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}`}
                className={`aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                  i === index ? "ring-accent" : "ring-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {photo.url && <img src={photo.url} alt="" className="size-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {full !== null && <FullScreen photos={photos} startAt={full} onClose={closeFull} />}
    </div>
  );
}
