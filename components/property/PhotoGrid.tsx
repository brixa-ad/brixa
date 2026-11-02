"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Sparkles, Star, Trash2, Undo2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export type GridPhoto = {
  key: string;
  url: string | null;
  /** edited by Brix (its original kept) or as it was taken — when it can be switched */
  edit?: "edited" | "original";
};

/** `key` moved to where `target` is (the others shift). */
function moved(order: string[], key: string, target: number) {
  const rest = order.filter((k) => k !== key);
  return [...rest.slice(0, target), key, ...rest.slice(target)];
}

/**
 * Thumbnails with "make cover" and "remove" controls. The first photo is the cover.
 * The order is changed by holding the grip and dragging (a finger or the mouse; the page scrolls
 * by itself near the screen's edge), or with the arrow keys on the grip.
 */
export function PhotoGrid({
  photos,
  onMakeCover,
  onRemove,
  onReorder,
  onEdit,
  onOpen,
  disabled,
}: {
  photos: GridPhoto[];
  onMakeCover: (key: string) => void;
  onRemove: (key: string) => void;
  /** the photos' keys in their new order */
  onReorder: (keys: string[]) => void;
  /** edit an original with Brix, or go back to the original */
  onEdit?: (key: string) => void;
  /** tap on a photo: see it big */
  onOpen?: (key: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  // while dragging: the photo held and the order it makes (shown at once, saved on release)
  const [drag, setDrag] = useState<{ key: string; order: string[] } | null>(null);
  const dragRef = useRef(drag);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  // the window's listeners while a photo is held (a tile moving in the page must not drop the finger)
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  function update(next: { key: string; order: string[] } | null) {
    dragRef.current = next;
    setDrag(next);
  }

  // the tile under the finger takes the held photo's place
  function hover() {
    const current = dragRef.current;
    if (!current) return;
    const tile = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest<HTMLElement>("[data-photo]");
    const target = tile?.dataset.photo;
    if (!target || target === current.key) return;
    const index = current.order.indexOf(target);
    if (index >= 0) update({ key: current.key, order: moved(current.order, current.key, index) });
  }

  // near the top or the bottom of the screen the page scrolls, so a photo can go far up or down
  function autoScroll() {
    if (!dragRef.current) return;
    const edge = 90;
    const { y } = pointer.current;
    const step = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
    if (step !== 0) {
      window.scrollBy(0, step);
      hover();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function start(event: React.PointerEvent<HTMLButtonElement>, key: string) {
    if (disabled || photos.length < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    stop.current();
    const id = event.pointerId;
    pointer.current = { x: event.clientX, y: event.clientY };
    update({ key, order: photos.map((p) => p.key) });

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      pointer.current = { x: e.clientX, y: e.clientY };
      hover();
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      stop.current();
      const current = dragRef.current;
      update(null);
      if (current && current.order.some((k, i) => k !== photos[i]?.key)) onReorder(current.order);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    stop.current = () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      stop.current = () => {};
    };
    frame.current = requestAnimationFrame(autoScroll);
  }

  function nudge(event: React.KeyboardEvent<HTMLButtonElement>, key: string) {
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    if (step === 0 || disabled) return;
    event.preventDefault();
    const keys = photos.map((p) => p.key);
    const index = keys.indexOf(key) + step;
    if (index >= 0 && index < keys.length) onReorder(moved(keys, key, index));
  }

  if (photos.length === 0) return null;

  const byKey = new Map(photos.map((p) => [p.key, p]));
  const shown = drag ? drag.order.map((k) => byKey.get(k)).filter((p): p is GridPhoto => Boolean(p)) : photos;

  return (
    <div className="space-y-2">
      <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${drag ? "select-none" : ""}`}>
        {shown.map((photo, index) => (
          <li
            key={photo.key}
            data-photo={photo.key}
            className={`group relative aspect-[4/3] overflow-hidden rounded-xl border bg-raised transition ${
              drag?.key === photo.key ? "scale-[0.96] border-accent opacity-70 ring-2 ring-accent" : "border-line"
            }`}
          >
            {photo.url &&
              (onOpen ? (
                <button type="button" onClick={() => onOpen(photo.key)} className="size-full cursor-pointer" aria-label={t.photos.open}>
                  <img src={photo.url} alt="" draggable={false} className="size-full object-cover" />
                </button>
              ) : (
                <img src={photo.url} alt="" draggable={false} className="pointer-events-none size-full object-cover" />
              ))}

            <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap items-center gap-1">
              <span className="rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{index === 0 ? t.photos.cover : index + 1}</span>
              {photo.edit === "edited" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <Sparkles className="size-3" />
                  {t.photos.edited}
                </span>
              )}
            </div>

            {photos.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onPointerDown={(event) => start(event, photo.key)}
                onKeyDown={(event) => nudge(event, photo.key)}
                onContextMenu={(event) => event.preventDefault()}
                title={t.photos.move}
                aria-label={t.photos.move}
                className="absolute right-2 top-2 grid size-9 cursor-grab touch-none select-none place-items-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80 active:cursor-grabbing"
              >
                <GripVertical className="size-5" />
              </button>
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
              {onEdit && photo.edit && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onEdit(photo.key)}
                  title={photo.edit === "edited" ? t.photos.backToOriginal : t.photos.enhanceOne}
                  aria-label={photo.edit === "edited" ? t.photos.backToOriginal : t.photos.enhanceOne}
                  className="grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
                >
                  {photo.edit === "edited" ? <Undo2 className="size-4" /> : <Sparkles className="size-4" />}
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
      {photos.length > 1 && <p className="text-xs text-muted">{t.photos.reorderHint}</p>}
    </div>
  );
}
