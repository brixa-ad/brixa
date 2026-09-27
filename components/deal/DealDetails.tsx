"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  addOffer,
  deleteOffer,
  saveDealDates,
  saveDealPayments,
  setOfferStatus,
  type DealActionResult,
  type StageDates,
} from "@/app/(app)/deals/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { addDays } from "@/lib/dates";
import { DEAL_LIMITS, isDay, parseAmount } from "@/lib/deal-validation";
import { formatDate, formatPrice } from "@/lib/format";
import { CURRENCIES, dealStages, type DealKind, type DealStage, type DealStatus } from "@/lib/options";

function useSave() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");
  function run(action: () => Promise<DealActionResult>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setStatus("saved");
        after?.();
      } else setStatus(result.message === "confirmed" ? t.deals.errorConfirmed : t.errors.generic);
    });
  }
  const message =
    status === "idle" ? null : status === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" />
        {t.deals.saved}
      </span>
    ) : (
      <span className="text-sm font-medium text-danger">{status}</span>
    );
  return { pending, run, message, reset: () => setStatus("idle") };
}

const STAGE_COLUMN: Record<DealStage, keyof StageDates> = {
  viewing: "viewing_on",
  offer: "offer_on",
  deposit: "deposit_on",
  preliminary: "preliminary_on",
  notary: "notary_on",
};

/** A date for every step: when it happened, or when it's planned (→ reminders). */
export function DealDates({
  dealId,
  kind,
  stage,
  status,
  dates,
  canEdit,
  today,
}: {
  dealId: string;
  kind: DealKind;
  stage: DealStage;
  status: DealStatus;
  dates: StageDates;
  canEdit: boolean;
  today: string;
}) {
  const { t, lang } = useI18n();
  const [values, setValues] = useState(dates);
  const { pending, run, message, reset } = useSave();
  const stages = dealStages(kind);
  const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
  const current = status === "won" ? stages.length : stages.indexOf(stage);
  const changed = stages.some((s) => values[STAGE_COLUMN[s]] !== dates[STAGE_COLUMN[s]]);

  return (
    <div className="space-y-3">
      {canEdit && <p className="text-xs text-muted">{t.deals.datesHint}</p>}
      <ol className="space-y-2">
        {stages.map((key, index) => {
          const column = STAGE_COLUMN[key];
          const value = values[column];
          // Reached steps are done — except the viewing / notary while the deal still waits at them.
          const done = index < current || (index === current && key !== "viewing" && key !== "notary");
          const soon = !done && value && (value === today || value === addDays(today, 1));
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done
                    ? "bg-success/15 text-success"
                    : index === current
                      ? "bg-accent text-on-accent"
                      : "bg-raised text-subtle"
                }`}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={`min-w-0 flex-1 text-sm ${index === current ? "font-semibold" : "text-fg-2"}`}>
                {labels[key]}
                {soon && (
                  <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                    {value === today ? t.home.todayLabel : t.home.tomorrowLabel}
                  </span>
                )}
              </span>
              {canEdit ? (
                <input
                  type="date"
                  value={value ?? ""}
                  aria-label={labels[key]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [column]: e.target.value || null }));
                    reset();
                  }}
                  className={`${inputClass} w-40 shrink-0 py-1.5!`}
                />
              ) : (
                <span className="text-sm text-muted">{value ? formatDate(value, lang) : "—"}</span>
              )}
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={pending || !changed}
            onClick={() => run(() => saveDealDates(dealId, values))}
            className={buttonClass.primary}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.deals.saveDates}
          </button>
          {message}
        </div>
      )}
    </div>
  );
}

type Payments = {
  depositAmount: number | null;
  preliminaryBank: number | null;
  preliminaryCash: number | null;
  notaryBank: number | null;
  notaryCash: number | null;
};

/** Deposit, what's paid at the preliminary contract and at the notary — by bank and in cash. */
export function DealPaymentsForm({
  dealId,
  price,
  currency,
  initial,
  canEdit,
}: {
  dealId: string;
  price: number | null;
  currency: string;
  initial: Payments;
  canEdit: boolean;
}) {
  const { t, lang } = useI18n();
  const str = (n: number | null) => (n === null ? "" : String(n));
  const [values, setValues] = useState({
    depositAmount: str(initial.depositAmount),
    preliminaryBank: str(initial.preliminaryBank),
    preliminaryCash: str(initial.preliminaryCash),
    notaryBank: str(initial.notaryBank),
    notaryCash: str(initial.notaryCash),
  });
  const { pending, run, message, reset } = useSave();

  const n = (key: keyof typeof values) => parseAmount(values[key]) ?? 0;
  const valid = Object.values(values).every((v) => {
    const parsed = parseAmount(v);
    return parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  });
  const paid = n("depositAmount") + n("preliminaryBank") + n("preliminaryCash");
  const remaining = price !== null ? Math.max(0, price - paid) : null;
  const money = (value: number) => formatPrice(value, currency, lang);

  const field = (key: keyof typeof values, label: string) => (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input
        inputMode="decimal"
        value={values[key]}
        disabled={!canEdit}
        placeholder="0"
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          reset();
        }}
        className={`${inputClass} mt-1`}
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t.deals.deposit}</p>
          {field("depositAmount", currency)}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t.deals.preliminary}</p>
          {field("preliminaryBank", t.deals.bank)}
          {field("preliminaryCash", t.deals.cash)}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t.deals.notary}</p>
          {field("notaryBank", t.deals.bank)}
          {field("notaryCash", t.deals.cash)}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-raised/60 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted">{t.deals.paid}</dt>
          <dd className="font-semibold tabular-nums">{money(paid)}</dd>
        </div>
        {remaining !== null && (
          <div>
            <dt className="text-xs text-muted">{t.deals.remaining}</dt>
            <dd className="font-semibold tabular-nums text-accent-fg">{money(remaining)}</dd>
          </div>
        )}
      </dl>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() =>
              run(() =>
                saveDealPayments(dealId, {
                  depositAmount: parseAmount(values.depositAmount),
                  preliminaryBank: parseAmount(values.preliminaryBank),
                  preliminaryCash: parseAmount(values.preliminaryCash),
                  notaryBank: parseAmount(values.notaryBank),
                  notaryCash: parseAmount(values.notaryCash),
                })
              )
            }
            className={buttonClass.primary}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.deals.savePayments}
          </button>
          {message}
        </div>
      )}
    </div>
  );
}

export type OfferRow = {
  id: string;
  amount: number;
  currency: string;
  offered_by: string;
  agency: string | null;
  offered_on: string;
  status: "open" | "accepted" | "rejected";
  note: string | null;
};

/** Offers from the buyer or through other agencies; accepting one sets the agreed price. */
export function DealOffers({
  dealId,
  offers,
  currency,
  canEdit,
  today,
}: {
  dealId: string;
  offers: OfferRow[];
  currency: string;
  canEdit: boolean;
  today: string;
}) {
  const { t, lang } = useI18n();
  const [adding, setAdding] = useState(false);
  const empty = { amount: "", currency, offeredBy: "", agency: "", offeredOn: today, note: "" };
  const [form, setForm] = useState(empty);
  const { pending, run, message, reset } = useSave();

  const amount = parseAmount(form.amount);
  const valid = amount !== null && Number.isFinite(amount) && amount >= 0 && form.offeredBy.trim() !== "" && isDay(form.offeredOn);
  const tone = { open: "bg-accent-soft text-accent-fg", accepted: "bg-success/10 text-success", rejected: "bg-raised text-muted" };

  return (
    <div className="space-y-4">
      {offers.length === 0 ? (
        <p className="text-sm text-muted">{t.deals.noOffers}</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className={`text-base font-bold tabular-nums ${offer.status === "rejected" ? "text-muted line-through" : ""}`}>
                  {formatPrice(offer.amount, offer.currency, lang)}
                </p>
                <p className="truncate text-sm">
                  {offer.offered_by}
                  {offer.agency && <span className="text-muted"> · {offer.agency}</span>}
                </p>
                <p className="text-xs text-subtle">{formatDate(offer.offered_on, lang)}</p>
                {offer.note && <p className="mt-1 text-xs text-fg-2">{offer.note}</p>}
              </div>
              <div className="flex items-center gap-1">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone[offer.status]}`}>
                  {t.deals.offerStatus[offer.status]}
                </span>
                {canEdit && offer.status !== "accepted" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setOfferStatus(offer.id, "accepted"))}
                    title={t.deals.accept}
                    aria-label={t.deals.accept}
                    className="grid size-8 place-items-center rounded-lg text-success transition hover:bg-success/10"
                  >
                    <Check className="size-4" />
                  </button>
                )}
                {canEdit && offer.status === "open" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setOfferStatus(offer.id, "rejected"))}
                    title={t.deals.reject}
                    aria-label={t.deals.reject}
                    className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-raised"
                  >
                    <X className="size-4" />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(t.common.delete + "?")) run(() => deleteOffer(offer.id));
                    }}
                    title={t.common.delete}
                    aria-label={t.common.delete}
                    className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {offers.some((o) => o.status !== "accepted") && canEdit && (
        <p className="text-xs text-muted">{t.deals.offerAcceptedHint}</p>
      )}

      {canEdit &&
        (adding ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
              <label className="block text-xs font-medium text-muted">
                {t.deals.offerAmount}
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t.form.currency}
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className={`${inputClass} mt-1`}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted">
                {t.deals.offerBy}
                <input
                  value={form.offeredBy}
                  maxLength={DEAL_LIMITS.name}
                  onChange={(e) => setForm((f) => ({ ...f, offeredBy: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t.deals.offerAgency}
                <input
                  value={form.agency}
                  maxLength={DEAL_LIMITS.name}
                  onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <label className="block text-xs font-medium text-muted">
                {t.deals.offerDate}
                <input
                  type="date"
                  value={form.offeredOn}
                  onChange={(e) => setForm((f) => ({ ...f, offeredOn: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t.deals.offerNote}
                <input
                  value={form.note}
                  maxLength={1000}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAdding(false)} className={buttonClass.secondary}>
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={pending || !valid}
                onClick={() =>
                  run(
                    () =>
                      addOffer(dealId, {
                        amount: amount!,
                        currency: form.currency,
                        offeredBy: form.offeredBy,
                        agency: form.agency,
                        offeredOn: form.offeredOn,
                        note: form.note,
                      }),
                    () => {
                      setForm(empty);
                      setAdding(false);
                    }
                  )
                }
                className={buttonClass.primary}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.deals.addOffer}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              reset();
            }}
            className={buttonClass.secondary}
          >
            <Plus className="size-4" />
            {t.deals.addOffer}
          </button>
        ))}
      {message}
    </div>
  );
}
