"use client";

import { useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const KEY = "brixa.photos.enhance";

function read() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

/** Whether new photos are edited like a magazine's (on unless switched off on this device). */
export function useEnhancePhotos() {
  const stored = useSyncExternalStore(
    () => () => {},
    read,
    () => true,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const on = chosen ?? stored;
  const set = (value: boolean) => {
    setChosen(value);
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {}
  };
  return [on, set] as const;
}

/** The switch above the photo picker. */
export function EnhanceSwitch({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-raised/40 p-3">
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-brand-cyan" />
          {t.photos.enhance}
        </span>
        <span className="block text-xs text-muted">{t.photos.enhanceHint}</span>
      </span>
    </label>
  );
}
