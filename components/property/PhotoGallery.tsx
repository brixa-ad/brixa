"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { Photo } from "@/lib/types";

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);

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
      <div className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-black">
        {current.url && <img src={current.url} alt="" className="size-full object-contain" />}

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
  );
}
