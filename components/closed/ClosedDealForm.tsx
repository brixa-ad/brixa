"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { deleteClosedDeal, saveClosedDeal } from "@/app/(app)/closed-deals/actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { NoteArea } from "@/components/ui/Dictate";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import { TownPicker } from "@/components/ui/TownPicker";
import { CLOSED_LIMITS, validateClosedDeal, type ClosedDealErrors, type ClosedDealInput } from "@/lib/closed-deal-validation";
import { formatNumber, formatPrice } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
import { CLOSED_CONDITIONS, CLOSED_SIDES, CONSTRUCTION_TYPES, type ClosedCondition } from "@/lib/options";
import type { Category, Settlement, Subtype } from "@/lib/types";

export type ClosedListing = {
  id: string;
  title: string;
  subtype_id: string;
  settlement_id: string | null;
  neighborhood_id: string | null;
  street: string | null;
  street_no: string | null;
  block: string | null;
  entrance: string | null;
  floor: number | null;
  apartment: string | null;
  area: number | null;
  construction_type: string | null;
};

type NumKey = "area" | "price" | "parkingPrice";
type Draft = Omit<ClosedDealInput, NumKey> & Record<NumKey, string>;
type AddressKey = "street" | "streetNo" | "block" | "entrance" | "floor" | "apartment";

const text = (n: number | null) => (n === null ? "" : String(n));
const parse = (value: string) => {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};
const onlyNumber = (value: string) => /^[\d\s]*([.,]\d{0,2})?$/.test(value);

/** One deal in the agency's register: what, where, for how much, who did it. */
export function ClosedDealForm({
  id,
  initial,
  lookups,
  today,
}: {
  id?: string;
  initial: ClosedDealInput;
  lookups: { categories: Category[]; subtypes: Subtype[]; settlements: Settlement[]; listings: ClosedListing[] };
  today: string;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => ({
    ...initial,
    area: text(initial.area),
    price: text(initial.price),
    parkingPrice: text(initial.parkingPrice),
  }));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ClosedDealErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, startDelete] = useTransition();

  const input: ClosedDealInput = { ...draft, area: parse(draft.area), price: parse(draft.price), parkingPrice: parse(draft.parkingPrice) };
  const errors: ClosedDealErrors = { ...serverErrors, ...(submitted ? validateClosedDeal(input) : {}) };
  const err = (key: keyof ClosedDealErrors) => (errors[key] ? t.errors[errors[key]!] : undefined);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors({});
  }

  function pickListing(listingId: string | null) {
    const listing = lookups.listings.find((l) => l.id === listingId);
    setDraft((d) => ({
      ...d,
      propertyId: listingId,
      ...(listing
        ? {
            subtypeId: listing.subtype_id,
            settlementId: listing.settlement_id,
            neighborhoodId: listing.neighborhood_id,
            street: listing.street ?? d.street,
            streetNo: listing.street_no ?? d.streetNo,
            block: listing.block ?? d.block,
            entrance: listing.entrance ?? d.entrance,
            floor: listing.floor !== null ? String(listing.floor) : d.floor,
            apartment: listing.apartment ?? d.apartment,
            area: listing.area !== null ? String(listing.area) : d.area,
            construction: listing.construction_type ?? d.construction,
          }
        : {}),
    }));
  }

  // what the register works out: total, €/m² with and without parking
  const price = input.price ?? 0;
  const parkingPrice = input.parkingPrice ?? 0;
  const total = price + parkingPrice;
  const area = input.area && input.area > 0 ? input.area : null;
  const euro = (n: number | null) => (n === null ? "—" : formatPrice(n, "EUR", lang));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailed(false);
    if (Object.keys(validateClosedDeal(input)).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    const result = await saveClosedDeal(input, id);
    if (result.ok) {
      router.push("/closed-deals");
      return;
    }
    setSaving(false);
    setServerErrors(result.errors ?? {});
    setFailed(Boolean(result.message));
  }

  const money = (key: "price" | "parkingPrice", label: string, required = false) => (
    <Field label={label} required={required} error={err(key)}>
      {(props) => (
        <input
          {...props}
          inputMode="decimal"
          value={draft[key]}
          onChange={(e) => onlyNumber(e.target.value) && set(key, e.target.value)}
          className={`${inputClass} max-w-48`}
        />
      )}
    </Field>
  );

  /** A short part of the address: a box just wide enough for it. */
  const part = (key: AddressKey, label: string, width: string) => (
    <label className={`block text-sm font-medium text-fg-2 ${width}`}>
      {label}
      <input
        value={draft[key]}
        maxLength={CLOSED_LIMITS[key]}
        aria-invalid={err(key) ? true : undefined}
        onChange={(e) => set(key, e.target.value)}
        className={`${inputClass} mt-1.5`}
      />
    </label>
  );

  const text$ = (key: "brokerName" | "colleagueName" | "colleagueAgency", label: string, placeholder: string, extra: { required?: boolean; hint?: string } = {}) => (
    <Field label={label} required={extra.required} error={err(key)} hint={extra.hint}>
      {(props) => (
        <input
          {...props}
          value={draft[key]}
          maxLength={CLOSED_LIMITS.name}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {failed ? t.errors.generic : t.form.fixErrors}
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t.closedDeals.date} required error={err("reportedOn")} hint={t.closedDeals.dateHint}>
            {(props) => (
              <input {...props} type="date" value={draft.reportedOn} max={today} onChange={(e) => set("reportedOn", e.target.value)} className={`${inputClass} max-w-48`} />
            )}
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.closedDeals.side}</span>
            <div className="inline-flex rounded-lg border border-line-strong bg-raised p-0.5" role="radiogroup">
              {CLOSED_SIDES.map((side) => (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={draft.side === side}
                  onClick={() => set("side", side)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                    draft.side === side ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
                  }`}
                >
                  {t.options.closedSide[side]}
                </button>
              ))}
            </div>
          </div>
          {lookups.listings.length > 0 && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.closedDeals.property}</span>
              <Combobox
                options={lookups.listings.map((l) => ({ value: l.id, label: l.title }))}
                value={draft.propertyId}
                onChange={pickListing}
                placeholder={t.form.choose}
                emptyText={t.location.noMatches}
                aria-label={t.closedDeals.property}
              />
              <p className="mt-1.5 text-xs text-muted">{t.closedDeals.propertyHint}</p>
            </div>
          )}
        </div>
      </Card>

      <Card title={t.closedDeals.place}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t.closedDeals.type} required error={err("subtypeId")}>
            {(props) => (
              <select {...props} value={draft.subtypeId ?? ""} onChange={(e) => set("subtypeId", e.target.value || null)} className={inputClass}>
                <option value="">{t.form.choose}</option>
                {lookups.categories.map((category) => (
                  <optgroup key={category.id} label={localName(category, lang)}>
                    {lookups.subtypes
                      .filter((s) => s.category_id === category.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {localName(s, lang)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            )}
          </Field>
          <TownPicker
            settlements={lookups.settlements}
            settlementId={draft.settlementId}
            neighborhoodId={draft.neighborhoodId}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
            townLabel={t.closedDeals.town}
            neighborhoodLabel={t.closedDeals.neighborhood}
            noNeighborhood={t.clients.anyNeighborhood}
          />
        </div>
        {/* the address in parts, as it's written: ул. Шипка 12, бл. 5, вх. А, ет. 3, ап. 7 */}
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="block min-w-0 flex-1 basis-56 text-sm font-medium text-fg-2">
            {t.location.street}
            <input
              value={draft.street}
              maxLength={CLOSED_LIMITS.street}
              placeholder={t.location.streetPlaceholder}
              onChange={(e) => set("street", e.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          {part("streetNo", t.location.streetNo, "w-20")}
          {part("block", t.location.block, "w-20")}
          {part("entrance", t.location.entrance, "w-16")}
          {part("floor", t.form.floor, "w-16")}
          {part("apartment", t.location.apartment, "w-24")}
        </div>
      </Card>

      <Card>
        <div className="space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.closedDeals.conditions}</span>
            <div className="flex flex-wrap gap-1.5">
              {CLOSED_CONDITIONS.map((c: ClosedCondition) => {
                const on = draft.conditions.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("conditions", on ? draft.conditions.filter((x) => x !== c) : [...draft.conditions, c])}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                    }`}
                  >
                    {t.options.closedCondition[c]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t.closedDeals.construction} error={err("construction")} className="w-48">
              {(props) => (
                <select {...props} value={draft.construction ?? ""} onChange={(e) => set("construction", e.target.value || null)} className={inputClass}>
                  <option value="">{t.form.choose}</option>
                  {CONSTRUCTION_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {t.options.construction[c]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t.closedDeals.areaLabel} required error={err("area")} className="w-28">
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={draft.area}
                  onChange={(e) => onlyNumber(e.target.value) && set("area", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium text-fg-2">
              <input type="checkbox" checked={draft.parking} onChange={(e) => set("parking", e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {t.closedDeals.parkingYes}
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {money("price", `${t.closedDeals.price} (€)`, true)}
          {draft.parking && money("parkingPrice", `${t.closedDeals.parkingPrice} (€)`)}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-raised/60 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted">{t.closedDeals.total}</dt>
            <dd className="font-semibold tabular-nums">{euro(input.price === null ? null : total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.closedDeals.perSqm}</dt>
            <dd className="font-semibold tabular-nums">{area && input.price !== null ? formatNumber(price / area, lang) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.closedDeals.perSqmParking}</dt>
            <dd className="font-semibold tabular-nums">
              {area && input.price !== null && parkingPrice > 0 ? formatNumber(total / area, lang) : "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {text$("brokerName", t.closedDeals.broker, t.closedDeals.brokerPlaceholder, { required: true })}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-fg-2">
          <input
            type="checkbox"
            checked={draft.doubleSided}
            onChange={(e) => set("doubleSided", e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">{t.closedDeals.double}</span>
            <span className="block text-xs text-muted">{t.closedDeals.doubleHint}</span>
          </span>
        </label>
        {!draft.doubleSided && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {text$("colleagueName", t.closedDeals.colleague, t.closedDeals.colleaguePlaceholder)}
            {text$("colleagueAgency", t.closedDeals.colleagueAgency, t.closedDeals.agencyPlaceholder, { hint: t.closedDeals.agencyHint })}
          </div>
        )}
      </Card>

      <Card title={t.closedDeals.note}>
        <NoteArea rows={3} maxLength={CLOSED_LIMITS.note} value={draft.note} onChange={(value) => set("note", value)} aria-label={t.closedDeals.note} />
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 sm:px-2">
          {id && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!window.confirm(t.closedDeals.deleteConfirm)) return;
                startDelete(async () => {
                  const result = await deleteClosedDeal(id);
                  if (result && !result.ok) window.alert(t.errors.generic);
                });
              }}
              className={`${buttonClass.danger} mr-auto`}
            >
              <Trash2 className="size-4" />
              {t.common.delete}
            </button>
          )}
          <Link href="/closed-deals" className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.common.saving : id ? t.closedDeals.save : t.closedDeals.create}
          </button>
        </div>
      </div>
    </form>
  );
}
