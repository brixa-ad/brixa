"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export type ComparePhoto = { key: string; url: string | null; edited: boolean };

/**
 * The listing's photos as a gallery, full screen: swipe or the arrows at the sides, the strip of
 * thumbnails under them — and for a photo Brix edited, "Before / After" to switch.
 */
export function PhotoCompare({
  photos,
  startAt,
  originalUrl,
  onClose,
}: {
  photos: ComparePhoto[];
  startAt: number;
  /** the untouched original of a photo (a signed link), fetched when needed */
  originalUrl: (key: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startAt);
  const [before, setBefore] = useState(false);
  const [originals, setOriginals] = useState<Record<string, string | null>>({});
  const photo = photos[index];
  const showBefore = before && photo.edited;

  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const next = (to + photos.length) % photos.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: Math.abs(next - index) > 1 ? "auto" : "smooth" });
  };

  // open on the photo tapped
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = startAt * el.clientWidth;
  }, [startAt]);

  // the original of the photo shown, once "Before" is wanted
  useEffect(() => {
    if (!before || !photo.edited || photo.key in originals) return;
    let live = true;
    void originalUrl(photo.key).then((url) => live && setOriginals((o) => ({ ...o, [photo.key]: url })));
    return () => {
      live = false;
    };
  }, [before, photo, originals, originalUrl]);

  // the thumbnail of the photo shown stays in view
  useEffect(() => {
    thumbs.current?.children[index]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goRef.current(index + 1);
      if (event.key === "ArrowLeft") goRef.current(index - 1);
      if (event.key === " ") {
        event.preventDefault();
        setBefore((b) => !b);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = keep;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, index]);

  const side = "absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70";
  const tab = (active: boolean) =>
    `rounded-full px-5 py-2 text-sm font-semibold transition ${active ? "bg-white text-black" : "text-white/80 hover:text-white"}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true">
      <div className="relative min-h-0 flex-1">
        <div
          ref={strip}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        >
          {photos.map((p, i) => {
            const src = i === index && showBefore ? originals[p.key] : p.url;
            return (
              <div key={p.key} className="grid size-full shrink-0 snap-center place-items-center">
                {src ? (
                  <img src={src} alt="" draggable={false} className="size-full object-contain" loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"} />
                ) : (
                  <Loader2 className="size-8 animate-spin text-white/70" />
                )}
              </div>
            );
          })}
        </div>

        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} aria-label="‹" className={`${side} left-3`}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="›" className={`${side} right-3`}>
              <ChevronRight className="size-6" />
            </button>
          </>
        )}

        <span className="absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
          {index + 1} / {photos.length}
          {photo.edited ? ` · ${showBefore ? t.photos.before : t.photos.after}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.cancel}
          className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex h-10 justify-center">
          {photo.edited ? (
            <div className="flex rounded-full bg-white/15 p-1 backdrop-blur">
              <button type="button" onClick={() => setBefore(true)} className={tab(showBefore)}>
                {t.photos.before}
              </button>
              <button type="button" onClick={() => setBefore(false)} className={tab(!showBefore)}>
                {t.photos.after}
              </button>
            </div>
          ) : (
            <span className="self-center text-xs text-white/60">{t.photos.notEdited}</span>
          )}
        </div>
        {photos.length > 1 && (
          <div ref={thumbs} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {photos.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}`}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                {p.url && <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
