"use client";

import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import type { SearchInput } from "@/lib/client-validation";
import { localName } from "@/lib/i18n/dictionaries";
import { CURRENCIES, type Currency } from "@/lib/options";
import type { Category, Feature, Region, Settlement, Subtype } from "@/lib/types";
import { MultiLocationPicker } from "./MultiLocationPicker";

export type SearchNumKey = "budgetMin" | "budgetMax" | "areaMin" | "areaMax" | "roomsMin" | "roomsMax";
export type SearchDraft = Omit<SearchInput, SearchNumKey> & Record<SearchNumKey, string>;
export const SEARCH_NUM_KEYS: SearchNumKey[] = ["budgetMin", "budgetMax", "areaMin", "areaMax", "roomsMin", "roomsMax"];

const parse = (value: string) => {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};

export function toSearchDraft(search: SearchInput): SearchDraft {
  const draft = { ...search } as unknown as SearchDraft;
  for (const key of SEARCH_NUM_KEYS) draft[key] = search[key] === null ? "" : String(search[key]);
  return draft;
}

export function fromSearchDraft(draft: SearchDraft): SearchInput {
  const search = { ...draft } as unknown as SearchInput;
  for (const key of SEARCH_NUM_KEYS) search[key] = parse(draft[key]);
  return search;
}

const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** What someone is looking for: sale / rent, kinds, places, budget, area, rooms, extras. */
export function SearchFields({
  search,
  onChange,
  lookups,
  error,
}: {
  search: SearchDraft;
  onChange: <K extends keyof SearchDraft>(key: K, value: SearchDraft[K]) => void;
  lookups: { categories: Category[]; subtypes: Subtype[]; features: Feature[]; regions: Region[]; settlements: Settlement[] };
  /** the error message for a number field, if any */
  error: (key: SearchNumKey) => string | undefined;
}) {
  const { t, lang } = useI18n();

  const numInput = (key: SearchNumKey, placeholder: string, decimal = true) => (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      value={search[key]}
      placeholder={placeholder}
      aria-invalid={error(key) ? true : undefined}
      aria-label={placeholder}
      onChange={(e) => {
        if (/^[\d\s]*([.,]\d{0,2})?$/.test(e.target.value)) onChange(key, e.target.value);
      }}
      className={inputClass}
    />
  );
  const rangeError = (a: SearchNumKey, b: SearchNumKey) => error(a) ?? error(b);

  return (
    <div className="space-y-6">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchOperation}</span>
        <div className="inline-flex rounded-lg border border-line-strong bg-raised p-0.5" role="radiogroup">
          {(["sale", "rent"] as const).map((op) => (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={search.operation === op}
              onClick={() => onChange("operation", op)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                search.operation === op ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
              }`}
            >
              {t.options.searchOperation[op]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchSubtypes}</span>
        <div className="space-y-2">
          {lookups.categories.map((category) => {
            const subs = lookups.subtypes.filter((s) => s.category_id === category.id);
            return (
              <div key={category.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-full text-xs font-semibold uppercase tracking-wide text-subtle sm:w-28">
                  {localName(category, lang)}
                </span>
                {subs.map((sub) => {
                  const on = search.subtypeIds.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange("subtypeIds", toggle(search.subtypeIds, sub.id))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                      }`}
                    >
                      {localName(sub, lang)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t.clients.searchSubtypesHint}</p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchLocations}</span>
        <MultiLocationPicker
          regions={lookups.regions}
          settlements={lookups.settlements}
          settlementIds={search.settlementIds}
          neighborhoodIds={search.neighborhoodIds}
          onChange={(next) => {
            onChange("settlementIds", next.settlementIds);
            onChange("neighborhoodIds", next.neighborhoodIds);
          }}
        />
        <p className="mt-1.5 text-xs text-muted">{t.clients.searchLocationsHint}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchBudget}</span>
          <div className="grid grid-cols-[1fr_1fr_84px] gap-2">
            {numInput("budgetMin", t.clients.from)}
            {numInput("budgetMax", t.clients.to)}
            <select
              aria-label={t.form.currency}
              value={search.currency}
              onChange={(e) => onChange("currency", e.target.value as Currency)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {rangeError("budgetMin", "budgetMax") && (
            <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("budgetMin", "budgetMax")}</p>
          )}
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchArea}</span>
          <div className="grid grid-cols-2 gap-2">
            {numInput("areaMin", t.clients.from)}
            {numInput("areaMax", t.clients.to)}
          </div>
          {rangeError("areaMin", "areaMax") && (
            <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("areaMin", "areaMax")}</p>
          )}
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchRooms}</span>
          <div className="grid grid-cols-2 gap-2">
            {numInput("roomsMin", t.clients.from, false)}
            {numInput("roomsMax", t.clients.to, false)}
          </div>
          {rangeError("roomsMin", "roomsMax") && (
            <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("roomsMin", "roomsMax")}</p>
          )}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchFeatures}</span>
        <div className="flex flex-wrap gap-1.5">
          {lookups.features.map((feature) => {
            const on = search.featureIds.includes(feature.id);
            return (
              <button
                key={feature.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange("featureIds", toggle(search.featureIds, feature.id))}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                }`}
              >
                {localName(feature, lang)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
