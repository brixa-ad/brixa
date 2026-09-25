"use client";

import { Star, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export type GridPhoto = { key: string; url: string | null };

/** Thumbnails with "make cover" and "remove" controls. The first photo is the cover. */
export function PhotoGrid({
  photos,
  onMakeCover,
  onRemove,
  disabled,
}: {
  photos: GridPhoto[];
  onMakeCover: (key: string) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  if (photos.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => (
        <li
          key={photo.key}
          className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-raised"
        >
          {photo.url && <img src={photo.url} alt="" className="size-full object-cover" />}

          {index === 0 && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
              {t.photos.cover}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {index !== 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onMakeCover(photo.key)}
                title={t.photos.makeCover}
                aria-label={t.photos.makeCover}
                className="grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
              >
                <Star className="size-4" />
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(photo.key)}
              title={t.photos.remove}
              aria-label={t.photos.remove}
              className="grid size-8 place-items-center rounded-lg bg-black/60 text-red-400 backdrop-blur hover:bg-black/80"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
