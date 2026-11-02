"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Link2, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { MAX_VIDEO_LINKS, MAX_VIDEO_MB, PLATFORM_NAMES, videoLink } from "@/lib/video";

/** The listing's own video in the form: the one it has, a new one chosen, or removed. */
export type VideoFile = { current: string | null; next: File | null; remove: boolean };

/** The video section of a listing's form: one short video from the phone, and links to where it's posted. */
export function VideoFields({
  links,
  onLinks,
  file,
  onFile,
  disabled,
}: {
  links: string[];
  onLinks: (next: string[]) => void;
  file: VideoFile;
  onFile: (next: VideoFile) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const V = t.video;
  const input = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState(false);
  // a new file plays from the phone itself, before it's uploaded
  const preview = useMemo(() => (file.next ? URL.createObjectURL(file.next) : null), [file.next]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const shown = preview ?? (file.remove ? null : file.current);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-2">
          <Film className="size-4 text-accent-fg" />
          {V.file}
        </p>
        {shown && <video src={shown} controls playsInline preload="metadata" className="max-h-80 w-full rounded-xl bg-black" />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={buttonClass.secondary}>
            <Film className="size-4" />
            {shown ? V.replace : V.choose}
          </button>
          {shown && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFile({ ...file, next: null, remove: Boolean(file.current) })}
              className={buttonClass.ghost}
            >
              <Trash2 className="size-4" />
              {V.removeFile}
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (!chosen) return;
              const big = chosen.size > MAX_VIDEO_MB * 1024 * 1024;
              setTooBig(big);
              if (!big) onFile({ ...file, next: chosen, remove: false });
            }}
          />
        </div>
        <p className={`text-xs ${tooBig ? "font-medium text-danger" : "text-muted"}`}>{fmt(tooBig ? V.tooBig : V.fileHint, { mb: MAX_VIDEO_MB })}</p>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-2">
          <Link2 className="size-4 text-accent-fg" />
          {V.links}
        </p>
        {links.map((link, i) => {
          const parsed = link.trim() ? videoLink(link) : null;
          return (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input
                  type="url"
                  inputMode="url"
                  value={link}
                  disabled={disabled}
                  placeholder="https://www.youtube.com/…"
                  aria-invalid={link.trim() && !parsed ? true : undefined}
                  onChange={(e) => onLinks(links.map((l, j) => (j === i ? e.target.value : l)))}
                  className={inputClass}
                />
                {link.trim() && (
                  <p className={`mt-1 text-xs ${parsed ? "text-muted" : "text-danger"}`}>
                    {parsed ? (parsed.platform === "other" ? V.otherSite : fmt(V.recognised, { platform: PLATFORM_NAMES[parsed.platform] })) : V.badLink}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onLinks(links.filter((_, j) => j !== i))}
                aria-label={V.removeLink}
                title={V.removeLink}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
        {links.length < MAX_VIDEO_LINKS && (
          <button type="button" disabled={disabled} onClick={() => onLinks([...links, ""])} className={buttonClass.ghost}>
            <Plus className="size-4" />
            {V.addLink}
          </button>
        )}
        <p className="text-xs text-muted">{V.linksHint}</p>
      </div>
    </div>
  );
}
