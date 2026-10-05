"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { addComparable, removeComparable } from "@/app/(app)/properties/comparable-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { formatNumber, formatPrice } from "@/lib/format";

export type ComparableRow = {
  id: string;
  url: string | null;
  source: string | null;
  title: string | null;
  area: number;
  floor: number | null;
  priceEur: number;
  sqm: number;
};

const toNumber = (value: string) => {
  const clean = value.replace(/\s/g, "").replace(",", ".");
  return clean === "" ? null : Number(clean);
};

/** The listings the broker found on the portals: the list, and (for whoever may change the listing) adding and removing. */
export function ComparablesEditor({ propertyId, items, canEdit }: { propertyId: string; items: ComparableRow[]; canEdit: boolean }) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState({ url: "", title: "", price: "", area: "", floor: "" });
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const price = toNumber(form.price);
  const area = toNumber(form.area);
  const floor = toNumber(form.floor);
  const ready = price !== null && price > 0 && area !== null && area > 0 && (floor === null || Number.isInteger(floor));

  function add() {
    if (!ready) return;
    setError(false);
    startTransition(async () => {
      const result = await addComparable(propertyId, { url: form.url, title: form.title, price: price!, area: area!, floor });
      if (result.ok) setForm({ url: "", title: "", price: "", area: "", floor: "" });
      else setError(true);
    });
  }

  function remove(id: string) {
    setRemoving(id);
    startTransition(async () => {
      await removeComparable(id, propertyId);
      setRemoving(null);
    });
  }

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t.rating.noComps}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {c.source ?? "—"}
                  {c.title && <span className="font-normal text-muted"> · {c.title}</span>}
                </p>
                <p className="text-xs text-muted">
                  {formatNumber(c.area, lang, 1)} {t.units.sqm}
                  {c.floor !== null && ` · ${t.rating.floor.toLowerCase()} ${c.floor}`} · {formatNumber(c.sqm, lang)} €/{t.units.sqm}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatPrice(c.priceEur, "EUR", lang)}</span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" title={t.rating.url} className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-raised hover:text-fg">
                  <ExternalLink className="size-4" />
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  title={t.rating.remove}
                  aria-label={t.rating.remove}
                  disabled={removing === c.id}
                  onClick={() => remove(c.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_auto]"
        >
          <input
            value={form.url}
            onChange={set("url")}
            inputMode="url"
            placeholder={t.rating.url}
            aria-label={t.rating.url}
            className={`${inputClass} col-span-2 sm:col-span-1`}
          />
          <input value={form.price} onChange={set("price")} inputMode="numeric" placeholder={t.rating.price} aria-label={t.rating.price} className={inputClass} />
          <input value={form.area} onChange={set("area")} inputMode="decimal" placeholder={t.rating.area} aria-label={t.rating.area} className={inputClass} />
          <input value={form.floor} onChange={set("floor")} inputMode="numeric" placeholder={t.rating.floor} aria-label={t.rating.floor} className={inputClass} />
          <button type="submit" disabled={!ready || pending} className={`${buttonClass.secondary} col-span-2 sm:col-span-1`}>
            {pending && !removing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t.rating.add}
          </button>
          <input
            value={form.title}
            onChange={set("title")}
            maxLength={160}
            placeholder={t.rating.titleField}
            aria-label={t.rating.titleField}
            className={`${inputClass} col-span-2 sm:col-span-5`}
          />
          {error && <p className="col-span-2 text-sm text-danger sm:col-span-5">{t.errors.generic}</p>}
        </form>
      )}
    </div>
  );
}
