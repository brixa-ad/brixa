"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { MAX_SOURCE_BYTES } from "@/lib/photos";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export function PhotoDropzone({
  onFiles,
  remaining,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  remaining: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function accept(list: FileList | null) {
    if (!list) return;
    const images = [...list].filter((file) => ACCEPT.includes(file.type));
    const tooLarge = images.find((file) => file.size > MAX_SOURCE_BYTES);
    const ok = images.filter((file) => file.size <= MAX_SOURCE_BYTES);

    setWarning(
      tooLarge
        ? fmt(t.photos.tooLarge, { name: tooLarge.name })
        : ok.length > remaining
          ? fmt(t.photos.limit, { max: remaining })
          : null
    );

    const allowed = ok.slice(0, Math.max(0, remaining));
    if (allowed.length > 0) onFiles(allowed);
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || remaining <= 0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line hover:border-line-strong hover:bg-raised"
        }`}
      >
        <ImagePlus className="size-7 text-subtle" />
        <span className="text-sm font-semibold text-accent-fg">{t.photos.add}</span>
        <span className="text-xs text-muted">{t.photos.dropHint}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        hidden
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
      />

      {warning && <p className="mt-2 text-xs font-medium text-warning">{warning}</p>}
    </div>
  );
}
