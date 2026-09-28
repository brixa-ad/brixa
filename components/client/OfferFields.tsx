"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { inputClass } from "@/components/ui/form";
import type { OfferInput } from "@/lib/client-validation";
import { localName } from "@/lib/i18n/dictionaries";
import { CURRENCIES, type Currency } from "@/lib/options";
import { createClient } from "@/lib/supabase/client";
import type { Category, Settlement, Subtype } from "@/lib/types";

export type OfferNumKey = "area" | "rooms" | "price";
export type OfferDraft = Omit<OfferInput, OfferNumKey> & Record<OfferNumKey, string>;

/**
 * What a seller / landlord has: kind, place, size, the price they hope for.
 * All optional — enough to keep the client in the database before there's a listing.
 */
export function OfferFields({
  offer,
  onChange,
  categories,
  subtypes,
  settlements,
  error,
}: {
  offer: OfferDraft;
  onChange: <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => void;
  categories: Category[];
  subtypes: Subtype[];
  settlements: Settlement[];
  error: (key: OfferNumKey) => string | undefined;
}) {
  const { t, lang } = useI18n();
  const [hoodCache, setHoodCache] = useState<Record<string, { id: string; name: string }[]>>({});
  const hoods = offer.settlementId ? hoodCache[offer.settlementId] : undefined;

  useEffect(() => {
    const id = offer.settlementId;
    if (!id || hoodCache[id]) return;
    let ignore = false;
    createClient()
      .from("geo_neighborhoods")
      .select("id, name")
      .eq("settlement_id", id)
      .order("name")
      .then(({ data }) => {
        if (!ignore) setHoodCache((cache) => ({ ...cache, [id]: data ?? [] }));
      });
    return () => {
      ignore = true;
    };
  }, [offer.settlementId, hoodCache]);

  const townOptions = useMemo(
    () => settlements.map((s) => ({ value: s.id, label: `${s.settlement_type} ${s.name}` })),
    [settlements]
  );

  const num = (key: OfferNumKey, label: string, decimal = true) => (
    <label className="block text-sm font-medium text-fg-2">
      {label}
      <input
        inputMode={decimal ? "decimal" : "numeric"}
        value={offer[key]}
        aria-invalid={error(key) ? true : undefined}
        onChange={(e) => {
          if (/^[\d\s]*([.,]\d{0,2})?$/.test(e.target.value)) onChange(key, e.target.value);
        }}
        className={`${inputClass} mt-1.5`}
      />
      {error(key) && <span className="mt-1 block text-xs font-medium text-danger">{error(key)}</span>}
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-line-strong bg-raised p-0.5" role="radiogroup" aria-label={t.clients.offerOperation}>
        {(["sale", "rent"] as const).map((op) => (
          <button
            key={op}
            type="button"
            role="radio"
            aria-checked={offer.operation === op}
            onClick={() => onChange("operation", op)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              offer.operation === op ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
            }`}
          >
            {t.options.offerOperation[op]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-fg-2">
          {t.clients.offerSubtype}
          <select
            value={offer.subtypeId ?? ""}
            onChange={(e) => onChange("subtypeId", e.target.value || null)}
            className={`${inputClass} mt-1.5`}
          >
            <option value="">{t.form.choose}</option>
            {categories.map((category) => (
              <optgroup key={category.id} label={localName(category, lang)}>
                {subtypes
                  .filter((s) => s.category_id === category.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {localName(s, lang)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.offerTown}</span>
          <Combobox
            options={townOptions}
            value={offer.settlementId}
            onChange={(id) => {
              onChange("settlementId", id);
              onChange("neighborhoodId", null);
            }}
            placeholder={t.form.choose}
            emptyText={t.location.noMatches}
            aria-label={t.clients.offerTown}
          />
        </div>
        <label className="block text-sm font-medium text-fg-2">
          {t.clients.offerNeighborhood}
          <select
            value={offer.neighborhoodId ?? ""}
            disabled={!offer.settlementId || !hoods?.length}
            onChange={(e) => onChange("neighborhoodId", e.target.value || null)}
            className={`${inputClass} mt-1.5`}
          >
            <option value="">{t.clients.anyNeighborhood}</option>
            {(hoods ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {num("area", t.clients.offerArea)}
        {num("rooms", t.clients.offerRooms, false)}
        <div>
          <span className="block text-sm font-medium text-fg-2">{t.clients.offerPrice}</span>
          <div className="mt-1.5 grid grid-cols-[1fr_84px] gap-2">
            <input
              inputMode="decimal"
              value={offer.price}
              aria-label={t.clients.offerPrice}
              aria-invalid={error("price") ? true : undefined}
              onChange={(e) => {
                if (/^[\d\s]*([.,]\d{0,2})?$/.test(e.target.value)) onChange("price", e.target.value);
              }}
              className={inputClass}
            />
            <select
              aria-label={t.form.currency}
              value={offer.currency}
              onChange={(e) => onChange("currency", e.target.value as Currency)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {error("price") && <span className="mt-1 block text-xs font-medium text-danger">{error("price")}</span>}
        </div>
      </div>
    </div>
  );
}
