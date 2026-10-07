"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Calculator, Loader2 } from "lucide-react";
import { saveDeal } from "@/app/(app)/deals/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { Combobox } from "@/components/ui/Combobox";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import { commissionRate, expectedCommission, rateLabel, type CommissionDefaults } from "@/lib/commission";
import {
  DEAL_LIMITS,
  PARTNER_SIDES,
  parseAmount,
  validateDeal,
  type DealErrors,
  type DealInput,
} from "@/lib/deal-validation";
import { fmt } from "@/lib/i18n/dictionaries";
import { CURRENCIES, DEAL_KINDS, dealStages, type Currency, type DealKind, type DealStage } from "@/lib/options";
import { formatPrice } from "@/lib/format";
import type { Member } from "@/lib/types";

export type DealFormLookups = {
  members: Member[];
  clients: { id: string; full_name: string; phone: string | null }[];
  properties: {
    id: string;
    title: string;
    operation_type: string;
    current_price: number | null;
    currency: string;
    commission_rate: number | null;
  }[];
  defaults: CommissionDefaults;
};

/** Raw form state — amounts stay strings while typing. */
export type DealFormValues = Omit<DealInput, "price" | "commission" | "buyerRate"> & {
  price: string;
  commission: string;
  buyerRate: string;
};

const toInput = (values: DealFormValues): DealInput => ({
  ...values,
  price: parseAmount(values.price),
  commission: parseAmount(values.commission),
  buyerRate: parseAmount(values.buyerRate),
});

/** Seller-side rate plus, on a double-sided deal, the buyer's. */
function totalRate(values: DealFormValues, propertyRate: number | null | undefined, defaults: CommissionDefaults) {
  const seller = commissionRate(values.kind, propertyRate, defaults);
  const buyer = values.doubleSided ? (parseAmount(values.buyerRate) ?? 0) : 0;
  return { seller, total: seller + (Number.isFinite(buyer) ? buyer : 0) };
}

export function DealForm({
  dealId,
  initial,
  lookups,
  canAssign,
}: {
  dealId?: string;
  initial: DealFormValues;
  lookups: DealFormLookups;
  canAssign: boolean;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  // Until the user types a commission, it follows the property and the price
  // (a saved deal keeps the amount it was saved with).
  const [commissionTouched, setCommissionTouched] = useState(Boolean(dealId && initial.commission));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<DealErrors>({});
  const [failed, setFailed] = useState<null | "generic" | "confirmed">(null);
  const [saving, setSaving] = useState(false);

  const input = toInput(values);
  const errors: DealErrors = { ...serverErrors, ...(submitted ? validateDeal(input) : {}) };
  const err = (key: keyof DealInput) => (errors[key] ? t.errors[errors[key]!] : undefined);

  const property = lookups.properties.find((p) => p.id === values.propertyId);
  const rates = totalRate(values, property?.commission_rate, lookups.defaults);
  const auto = expectedCommission(values.kind, input.price, values.currency, rates.total);
  const rateText = values.doubleSided
    ? `${rateLabel(values.kind, rates.seller, t.units.months)} + ${rateLabel(values.kind, rates.total - rates.seller, t.units.months)}`
    : rateLabel(values.kind, rates.seller, t.units.months);

  function set<K extends keyof DealFormValues>(key: K, value: DealFormValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // A lease has no preliminary contract.
      if (key === "kind" && !dealStages(next.kind).includes(next.stage)) next.stage = "offer";
      return withAutoCommission(next);
    });
    setServerErrors({});
  }

  function withAutoCommission(next: DealFormValues): DealFormValues {
    if (commissionTouched) return next;
    const p = lookups.properties.find((x) => x.id === next.propertyId);
    const amount = expectedCommission(
      next.kind,
      parseAmount(next.price),
      next.currency,
      totalRate(next, p?.commission_rate, lookups.defaults).total
    );
    return { ...next, commission: amount === null ? next.commission : String(amount) };
  }

  function chooseProperty(id: string | null) {
    const p = lookups.properties.find((x) => x.id === id);
    setValues((current) => {
      const next: DealFormValues = { ...current, propertyId: id };
      if (p) {
        next.kind = p.operation_type === "rent" ? "rent" : "sale";
        if (!dealStages(next.kind).includes(next.stage)) next.stage = "offer";
        if (p.current_price !== null) next.price = String(p.current_price);
        // our listing — so another agency would be bringing the buyer
        next.partnerSide = "buyer";
        if ((CURRENCIES as readonly string[]).includes(p.currency)) next.currency = p.currency as Currency;
      }
      return withAutoCommission(next);
    });
    setServerErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailed(null);
    if (Object.keys(validateDeal(input)).length > 0) return;
    setSaving(true);
    const result = await saveDeal(input, dealId);
    if (result.ok) {
      router.push(`/deals/${result.id}`);
      return;
    }
    setSaving(false);
    setServerErrors(result.errors ?? {});
    setFailed(result.message ?? null);
  }

  const chip = (active: boolean) =>
    `inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      active ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
    }`;
  const stageLabels = values.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {failed === "confirmed"
            ? t.deals.errorConfirmed
            : failed
              ? t.errors.generic
              : errors.propertyId === "required"
                ? t.deals.needOne
                : t.form.fixErrors}
        </div>
      )}

      <Card>
        <div className="space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.deals.fieldKind}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {DEAL_KINDS.map((kind: DealKind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={values.kind === kind}
                  onClick={() => set("kind", kind)}
                  className={chip(values.kind === kind)}
                >
                  {t.options.dealKind[kind]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t.deals.fieldProperty} error={err("propertyId") && errors.propertyId !== "required" ? err("propertyId") : undefined}>
              {(props) => (
                <Combobox
                  {...props}
                  options={lookups.properties.map((p) => ({
                    value: p.id,
                    label: p.title,
                    hint: formatPrice(p.current_price, p.currency, lang) ?? undefined,
                  }))}
                  value={values.propertyId}
                  onChange={chooseProperty}
                  placeholder={t.tasks.searchProperty}
                  emptyText={t.location.noMatches}
                />
              )}
            </Field>
            <Field label={t.deals.fieldClient} error={err("clientId") && errors.clientId !== "required" ? err("clientId") : undefined}>
              {(props) => (
                <Combobox
                  {...props}
                  options={lookups.clients.map((c) => ({ value: c.id, label: c.full_name, hint: c.phone ?? undefined }))}
                  value={values.clientId}
                  onChange={(id) => set("clientId", id)}
                  placeholder={t.tasks.searchClient}
                  emptyText={t.location.noMatches}
                />
              )}
            </Field>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.deals.fieldStage}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {dealStages(values.kind).map((stage: DealStage) => (
                <button
                  key={stage}
                  type="button"
                  role="radio"
                  aria-checked={values.stage === stage}
                  onClick={() => set("stage", stage)}
                  className={chip(values.stage === stage)}
                >
                  {stageLabels[stage]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label={t.deals.fieldPrice} error={err("price")}>
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={values.price}
                  onChange={(e) => set("price", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={t.form.currency} error={err("currency")}>
              {(props) => (
                <select
                  {...props}
                  value={values.currency}
                  onChange={(e) => set("currency", e.target.value as Currency)}
                  className={inputClass}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <Field
            label={t.deals.fieldCommission}
            error={err("commission")}
            hint={
              auto !== null && String(auto) === values.commission
                ? fmt(t.deals.commissionAuto, { rate: rateText })
                : undefined
            }
          >
            {(props) => (
              <div className="flex gap-2">
                <input
                  {...props}
                  inputMode="decimal"
                  value={values.commission}
                  onChange={(e) => {
                    setCommissionTouched(true);
                    setValues((v) => ({ ...v, commission: e.target.value }));
                  }}
                  className={inputClass}
                />
                {auto !== null && String(auto) !== values.commission && (
                  <button
                    type="button"
                    onClick={() => {
                      setCommissionTouched(false);
                      setValues((v) => ({ ...v, commission: String(auto) }));
                    }}
                    className={`${buttonClass.secondary} shrink-0`}
                  >
                    <Calculator className="size-4" />
                    <span className="hidden sm:inline">{t.deals.useAuto}</span>
                  </button>
                )}
              </div>
            )}
          </Field>

          {/* ---- both sides pay us / the other side is another agency ---- */}
          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={values.doubleSided}
                onChange={(e) => {
                  const on = e.target.checked;
                  setValues((current) =>
                    withAutoCommission({
                      ...current,
                      doubleSided: on,
                      withPartner: on ? false : current.withPartner,
                      buyerRate:
                        on && !current.buyerRate
                          ? String(current.kind === "rent" ? lookups.defaults.rentMonths : lookups.defaults.salePercent)
                          : current.buyerRate,
                    })
                  );
                }}
                className="mt-0.5 size-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium">{t.deals.doubleSided}</span>
                <span className="block text-xs text-muted">{t.deals.doubleSidedHint}</span>
              </span>
            </label>
            {values.doubleSided && (
              <Field label={values.kind === "rent" ? t.deals.buyerRateRent : t.deals.buyerRate} error={err("buyerRate")}>
                {(props) => (
                  <input
                    {...props}
                    inputMode="decimal"
                    value={values.buyerRate}
                    onChange={(e) => set("buyerRate", e.target.value)}
                    className={`${inputClass} sm:max-w-40`}
                  />
                )}
              </Field>
            )}

            <label className="flex cursor-pointer items-start gap-3 border-t border-line-soft pt-3">
              <input
                type="checkbox"
                checked={values.withPartner}
                onChange={(e) => {
                  const on = e.target.checked;
                  setValues((current) =>
                    withAutoCommission({ ...current, withPartner: on, doubleSided: on ? false : current.doubleSided })
                  );
                }}
                className="mt-0.5 size-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium">{t.deals.withPartner}</span>
                <span className="block text-xs text-muted">{t.deals.withPartnerHint}</span>
              </span>
            </label>
            {values.withPartner && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t.deals.partnerAgency} required error={err("partnerAgency")}>
                  {(props) => (
                    <input
                      {...props}
                      value={values.partnerAgency}
                      maxLength={DEAL_LIMITS.name}
                      onChange={(e) => set("partnerAgency", e.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
                <Field label={t.deals.partnerBroker} error={err("partnerBroker")}>
                  {(props) => (
                    <input
                      {...props}
                      value={values.partnerBroker}
                      maxLength={DEAL_LIMITS.name}
                      onChange={(e) => set("partnerBroker", e.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.deals.partnerSide}</span>
                  <div className="flex gap-2" role="radiogroup">
                    {PARTNER_SIDES.map((side) => (
                      <button
                        key={side}
                        type="button"
                        role="radio"
                        aria-checked={values.partnerSide === side}
                        onClick={() => set("partnerSide", side)}
                        className={chip(values.partnerSide === side)}
                      >
                        {side === "buyer" ? t.deals.partnerBuyer : t.deals.partnerSeller}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Field
            label={t.deals.fieldBroker}
            error={err("brokerId")}
            hint={canAssign ? t.deals.brokerHint : t.deals.brokerLocked}
          >
            {(props) => (
              <select
                {...props}
                value={values.brokerId}
                disabled={!canAssign}
                onChange={(e) => set("brokerId", e.target.value)}
                className={inputClass}
              >
                {lookups.members.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t.deals.fieldNotes} required error={err("notes")}>
            {(props) => (
              <NoteArea
                {...props}
                rows={4}
                maxLength={DEAL_LIMITS.notes}
                value={values.notes}
                onChange={(value) => set("notes", value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 sm:px-2">
          <Link href={dealId ? `/deals/${dealId}` : "/deals"} className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.common.saving : dealId ? t.deals.save : t.deals.create}
          </button>
        </div>
      </div>
    </form>
  );
}
