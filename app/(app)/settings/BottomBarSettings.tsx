"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { NavIcon } from "@/components/NavIcon";
import { buttonClass } from "@/components/ui/form";
import { BOTTOM_NAV_MAX, DEFAULT_BOTTOM_NAV, type NavKey } from "@/lib/nav";
import { saveBottomNav } from "./actions";

/** Pick up to five sections for the phone's bottom bar and put them in order. */
export function BottomBarSettings({ initial, all }: { initial: NavKey[]; all: NavKey[] }) {
  const { t } = useI18n();
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const others = all.filter((key) => !items.includes(key));
  const full = items.length >= BOTTOM_NAV_MAX;

  function change(next: NavKey[]) {
    setItems(next);
    setStatus("idle");
  }
  function move(index: number, by: -1 | 1) {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    change(next);
  }
  function save(keys: NavKey[] | null) {
    startTransition(async () => {
      const result = await saveBottomNav(keys);
      setStatus(result.ok ? "saved" : "failed");
    });
  }

  const iconButton =
    "grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-5">
      {/* preview of the bar */}
      <div
        className="grid rounded-xl border border-line bg-canvas/60 py-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {items.map((key) => (
          <span key={key} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-fg-2">
            <NavIcon name={key} className="size-5" />
            <span className="max-w-full truncate px-1">{t.nav[key]}</span>
          </span>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
          {t.settings.inBar} · {items.length}/{BOTTOM_NAV_MAX}
        </p>
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {items.map((key, index) => (
            <li key={key} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
              <NavIcon name={key} className="size-5 text-accent-fg" />
              <span className="flex-1 text-sm font-medium">{t.nav[key]}</span>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t.settings.moveUp} className={iconButton}>
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label={t.settings.moveDown}
                className={iconButton}
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => change(items.filter((k) => k !== key))}
                disabled={items.length === 1}
                aria-label={t.settings.remove}
                className={`${iconButton} hover:text-danger`}
              >
                <Minus className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {others.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t.settings.available}</p>
          <ul className="divide-y divide-line-soft rounded-xl border border-line">
            {others.map((key) => (
              <li key={key} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
                <NavIcon name={key} className="size-5 text-muted" />
                <span className="flex-1 text-sm text-fg-2">{t.nav[key]}</span>
                <button
                  type="button"
                  onClick={() => change([...items, key])}
                  disabled={full}
                  aria-label={t.settings.add}
                  className={`${iconButton} hover:text-accent-fg`}
                >
                  <Plus className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {full && <p className="mt-2 text-xs text-muted">{t.settings.full}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save(items)} disabled={pending} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.settings.save}
        </button>
        <button
          type="button"
          onClick={() => {
            change(DEFAULT_BOTTOM_NAV);
            save(null);
          }}
          disabled={pending}
          className={buttonClass.ghost}
        >
          <RotateCcw className="size-4" />
          {t.settings.reset}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.settings.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
