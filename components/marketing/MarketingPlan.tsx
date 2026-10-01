"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, EyeOff, Loader2, Plus, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import {
  addMarketingPoint,
  removeMarketingPoint,
  setMarketingHidden,
  tickMarketing,
  untickMarketing,
} from "@/app/(app)/properties/marketing-actions";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { pointLabel, pointState, type MarketingDone, type MarketingPoint } from "@/lib/marketing";

/** The listing's marketing plan: tick off what's done (weekly points: every week); leave out or add points. */
export function MarketingPlan({
  propertyId,
  shown,
  hidden,
  extraKeys,
  done,
  today,
  canEdit,
}: {
  propertyId: string;
  shown: MarketingPoint[];
  hidden: MarketingPoint[];
  /** the listing's own points (removed, not hidden) */
  extraKeys: string[];
  done: MarketingDone[];
  today: string;
  canEdit: boolean;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [weekly, setWeekly] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (id: string, action: () => Promise<{ ok: boolean }>) => {
    setBusy(id);
    startTransition(async () => {
      await action();
      router.refresh();
      setBusy(null);
    });
  };

  const states = shown.map((point) => ({ point, ...pointState(point, done, today) }));
  const okCount = states.filter((s) => s.ok).length;

  return (
    <div>
      <div className="mb-3">
        <p className="text-xs font-semibold text-muted">{fmt(t.marketing.progress, { done: okCount, total: states.length })}</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan" style={{ width: `${states.length ? (okCount / states.length) * 100 : 0}%` }} />
        </div>
      </div>

      <ul className="-mx-2 space-y-0.5">
        {states.map(({ point, ok, last, times, planned, latest }) => {
          const id = point.key;
          const own = extraKeys.includes(point.key);
          return (
            <li key={id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-raised/60">
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => run(id, () => tickMarketing(propertyId, point.key))}
                aria-label={t.marketing.markDone}
                title={t.marketing.markDone}
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition ${
                  ok ? "border-success bg-success text-white" : "border-line-strong hover:border-accent"
                } ${canEdit ? "" : "cursor-default"}`}
              >
                {busy === id ? <Loader2 className="size-3 animate-spin" /> : ok ? <Check className="size-3.5" /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${ok ? "text-fg" : "text-fg-2"}`}>
                  {pointLabel(point, t)}
                  {point.weekly && <span className="ml-1.5 text-[11px] font-medium text-accent-fg">↻ {t.marketing.weekly}</span>}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
                  {point.weekly && <span className={ok ? "text-success" : "text-warning"}>{ok ? t.marketing.thisWeek : t.marketing.notThisWeek}</span>}
                  {last && (
                    <span className="inline-flex items-center gap-1">
                      {formatDate(last.done_on, lang)}
                      {times > 1 && ` · ${times}×`}
                      {last.auto && <Sparkles className="size-3 text-brand-cyan" aria-label={t.marketing.auto} />}
                    </span>
                  )}
                  {planned && (
                    <span className="inline-flex items-center gap-1 text-accent-fg">
                      <CalendarClock className="size-3" />
                      {fmt(t.marketing.planned, { date: formatDate(planned.done_on, lang) })}
                    </span>
                  )}
                </p>
              </div>
              {canEdit && (
                <span className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                  {latest && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(id, () => untickMarketing(propertyId, latest.id))}
                      aria-label={t.marketing.undo}
                      title={t.marketing.undo}
                      className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"
                    >
                      <Undo2 className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(id, () => (own ? removeMarketingPoint(propertyId, point.key) : setMarketingHidden(propertyId, point.key, true)))}
                    aria-label={t.marketing.hide}
                    title={t.marketing.hide}
                    className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised hover:text-danger"
                  >
                    {own ? <X className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <input
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t.marketing.addPlaceholder}
            className={`${inputClass} min-w-40 flex-1`}
          />
          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="size-4" />
            {t.marketing.addWeekly}
          </label>
          <button
            type="button"
            disabled={pending || label.trim().length < 2}
            onClick={() =>
              run("add", async () => {
                const result = await addMarketingPoint(propertyId, label, weekly);
                if (result.ok) {
                  setLabel("");
                  setWeekly(false);
                }
                return result;
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm font-medium text-fg-2 hover:bg-overlay"
          >
            {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t.marketing.add}
          </button>
        </div>
      )}

      {canEdit && hidden.length > 0 && (
        <div className="mt-3 text-xs text-subtle">
          <p className="mb-1 font-semibold">{t.marketing.hidden}</p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((point) => (
              <button
                key={point.key}
                type="button"
                disabled={pending}
                onClick={() => run(point.key, () => setMarketingHidden(propertyId, point.key, false))}
                title={t.marketing.show}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-fg-2 hover:border-accent hover:text-accent-fg"
              >
                <RotateCcw className="size-3" />
                {pointLabel(point, t)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
