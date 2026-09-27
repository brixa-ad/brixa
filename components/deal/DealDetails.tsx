"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, CheckCircle2, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  addOffer,
  deleteOffer,
  scheduleDealStep,
  saveDealPayments,
  setOfferStatus,
  type DealActionResult,
} from "@/app/(app)/deals/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { addDays } from "@/lib/dates";
import { DEAL_LIMITS, isDay, parseAmount } from "@/lib/deal-validation";
import { formatDate, formatDayMonth, formatPrice } from "@/lib/format";
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

export type StepSchedule = Record<DealStage, { day: string | null; time: string | null }>;

/**
 * Under the stage bar: schedule the next step (day + time) — then the steps
 * with the day each happened or is planned for.
 */
export function DealSchedule({
  dealId,
  kind,
  stage,
  status,
  steps,
  canEdit,
  today,
}: {
  dealId: string;
  kind: DealKind;
  stage: DealStage;
  status: DealStatus;
  steps: StepSchedule;
  canEdit: boolean;
  today: string;
}) {
  const { t, lang } = useI18n();
  const { pending, run, message, reset } = useSave();
  const stages = dealStages(kind);
  const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
  const current = status === "won" ? stages.length : stages.indexOf(stage);
  // Reached steps are done — except the viewing / notary while the deal still waits at them.
  const isDone = (key: DealStage, index: number) =>
    index < current || (index === current && key !== "viewing" && key !== "notary");
  const ahead = stages.filter((key, index) => !isDone(key, index));

  // Start with the first step ahead that has no date yet.
  const first = ahead.find((key) => !steps[key].day) ?? ahead[0];
  const [step, setStep] = useState<DealStage | undefined>(first);
  const [day, setDay] = useState(first ? (steps[first].day ?? "") : "");
  const [time, setTime] = useState(first ? (steps[first].time?.slice(0, 5) ?? "") : "");

  function pick(next: DealStage) {
    setStep(next);
    setDay(steps[next].day ?? "");
    setTime(steps[next].time?.slice(0, 5) ?? "");
    reset();
  }

  const when = (key: DealStage) => {
    const { day: d, time: tm } = steps[key];
    if (!d) return null;
    return tm ? `${formatDayMonth(d, lang)}, ${tm.slice(0, 5)}` : formatDate(d, lang);
  };

  return (
    <div className="space-y-4">
      {canEdit && status === "open" && step && (
        <div className="space-y-3 rounded-xl border border-accent/30 bg-accent-soft/40 p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-accent-fg" />
            {t.deals.scheduleTitle}
          </p>
          <label className="block text-xs font-medium text-muted">
            {t.deals.scheduleStep}
            <select value={step} onChange={(e) => pick(e.target.value as DealStage)} className={`${inputClass} mt-1`}>
              {ahead.map((key) => (
                <option key={key} value={key}>
                  {labels[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
            <label className="block min-w-0 text-xs font-medium text-muted">
              {t.deals.scheduleDate}
              <input
                type="date"
                value={day}
                min={today}
                onChange={(e) => {
                  setDay(e.target.value);
                  reset();
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              {t.deals.scheduleTime}
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  reset();
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending || !isDay(day)}
            onClick={() => run(() => scheduleDealStep(dealId, step, day, time || null))}
            className={`${buttonClass.primary} w-full`}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.deals.schedule}
          </button>
          {message}
          <p className="text-[11px] text-muted">{t.deals.scheduleHint}</p>
        </div>
      )}

      <ol className="space-y-1">
        {stages.map((key, index) => {
          const done = isDone(key, index);
          const date = when(key);
          const d = steps[key].day;
          const soon = !done && d && (d === today || d === addDays(today, 1));
          return (
            <li key={key} className="flex items-center gap-3 py-1.5">
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
              <span className={`min-w-0 flex-1 truncate text-sm ${index === current ? "font-semibold" : "text-fg-2"}`}>
                {labels[key]}
              </span>
              {soon && (
                <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                  {d === today ? t.home.todayLabel : t.home.tomorrowLabel}
                </span>
              )}
              <span className={`shrink-0 text-sm tabular-nums ${date ? (done ? "text-muted" : "font-medium") : "text-faint"}`}>
                {date ?? "—"}
              </span>
              {canEdit && status === "open" && !done && date && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => scheduleDealStep(dealId, key, null, null))}
                  title={t.deals.unschedule}
                  aria-label={t.deals.unschedule}
                  className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-subtle transition hover:bg-raised hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
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
