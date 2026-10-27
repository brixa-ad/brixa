"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export type ComparePhoto = { key: string; url: string | null; edited: boolean };

/**
 * A photo full screen, and for one Brix edited: "Before" and "After" to switch between — tap, or
 * hold the photo to see the original while the finger is down.
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
  const [index, setIndex] = useState(startAt);
  const [before, setBefore] = useState(false);
  const [held, setHeld] = useState(false);
  const [originals, setOriginals] = useState<Record<string, string | null>>({});
  const photo = photos[index];
  const showBefore = (before || held) && photo.edited;
  const original = originals[photo.key];

  useEffect(() => {
    if (!photo.edited || photo.key in originals) return;
    let live = true;
    void originalUrl(photo.key).then((url) => live && setOriginals((o) => ({ ...o, [photo.key]: url })));
    return () => {
      live = false;
    };
  }, [photo, originals, originalUrl]);

  useEffect(() => {
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      if (event.key === " ") setBefore((b) => !b);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = keep;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, photos.length]);

  const src = showBefore ? original : photo.url;
  const round = "grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25";
  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-white text-black" : "text-white/80 hover:text-white"}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true">
      <div
        className="relative grid min-h-0 flex-1 select-none place-items-center"
        onPointerDown={() => photo.edited && setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {src ? (
          <img src={src} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <Loader2 className="size-8 animate-spin text-white/70" />
        )}
        {photo.edited && (
          <span className="pointer-events-none absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
            {showBefore ? t.photos.before : t.photos.after}
          </span>
        )}
      </div>

      <button type="button" onClick={onClose} aria-label={t.common.cancel} className={`${round} absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))]`}>
        <X className="size-5" />
      </button>

      <div className="flex items-center justify-between gap-3 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} disabled={photos.length < 2} aria-label="‹" className={`${round} disabled:opacity-30`}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex flex-col items-center gap-1.5">
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
            <span className="text-xs text-white/60">{t.photos.notEdited}</span>
          )}
          <span className="text-xs text-white/60">
            {index + 1} / {photos.length}
            {photo.edited ? ` · ${t.photos.holdHint}` : ""}
          </span>
        </div>
        <button type="button" onClick={() => setIndex((i) => (i + 1) % photos.length)} disabled={photos.length < 2} aria-label="›" className={`${round} disabled:opacity-30`}>
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
