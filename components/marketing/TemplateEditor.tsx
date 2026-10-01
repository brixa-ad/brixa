"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from "lucide-react";
import { saveMarketingTemplate } from "@/app/(app)/properties/marketing-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { MARKETING_KEYS, extraKey, pointLabel, type MarketingPoint } from "@/lib/marketing";

/** Managers: the points every listing's marketing plan gets — in order, weekly or not, the agency's own words. */
export function TemplateEditor({ initial }: { initial: MarketingPoint[] }) {
  const { t } = useI18n();
  const [items, setItems] = useState<MarketingPoint[]>(initial);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  // the template's standard points left out, to bring back
  const missing = MARKETING_KEYS.filter((key) => !items.some((p) => p.key === key));

  const change = (next: MarketingPoint[]) => {
    setItems(next);
    setStatus("idle");
  };
  const move = (i: number, step: -1 | 1) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + step, 0, item);
    change(next);
  };

  return (
    <div>
      <ul className="-mx-2 space-y-0.5">
        {items.map((point, i) => (
          <li key={point.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raised/60">
            <span className="min-w-0 flex-1 truncate text-sm">{pointLabel(point, t)}</span>
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={Boolean(point.weekly)}
                onChange={(e) => change(items.map((p, j) => (j === i ? { ...p, weekly: e.target.checked } : p)))}
                className="size-3.5"
              />
              {t.marketing.weekly}
            </label>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t.marketing.up} className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised disabled:opacity-30">
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t.marketing.down} className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised disabled:opacity-30">
              <ArrowDown className="size-3.5" />
            </button>
            <button type="button" onClick={() => change(items.filter((_, j) => j !== i))} aria-label={t.marketing.remove} className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised hover:text-danger">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missing.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => change([...items, { key }])}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-2 hover:border-accent hover:text-accent-fg"
            >
              <Plus className="size-3" />
              {pointLabel({ key }, t)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={t.marketing.addPlaceholder} className={`${inputClass} flex-1`} />
        <button
          type="button"
          disabled={label.trim().length < 2}
          onClick={() => {
            change([...items, { key: extraKey().replace("x-", "c-"), label: label.trim() }]);
            setLabel("");
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm font-medium text-fg-2 hover:bg-overlay"
        >
          <Plus className="size-4" />
          {t.marketing.add}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveMarketingTemplate(items);
              setStatus(result.ok ? "saved" : "failed");
            })
          }
          className={buttonClass.primary}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.marketing.templateSave}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <Check className="size-4" />
            {t.marketing.templateSaved}
          </span>
        )}
        {status === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
