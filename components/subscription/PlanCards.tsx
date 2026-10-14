"use client";

import { useState, useTransition } from "react";
import { Check, CreditCard, Loader2, Users } from "lucide-react";
import { changePlan, payByCard, requestPlan } from "@/app/(app)/subscription/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { YEAR_MONTHS, priceFor, type BillingInterval, type Plan } from "@/lib/subscription";

/**
 * The packages side by side: up to how many people, the price by the month or the year, and (for the
 * agency's owner) pay by card — or ask for an invoice to pay by bank transfer.
 */
export function PlanCards({
  plans,
  current,
  people,
  canRequest,
  card,
}: {
  plans: Plan[];
  current: string | null;
  /** how many the agency is now: the smallest package that fits is marked */
  people: number | null;
  canRequest: boolean;
  /** card payments: on (Stripe set up), the agency already pays by card, and its period */
  card: { on: boolean; subscribed: boolean; interval: BillingInterval | null };
}) {
  const { t, lang } = useI18n();
  const B = t.billing;
  const [period, setPeriod] = useState<BillingInterval>(card.interval ?? "month");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fits = people === null ? null : plans.find((p) => p.max_people === null || p.max_people >= people)?.code ?? null;
  // the package the owner is looking at: the one that fits, until they tap another
  const [picked, setPicked] = useState<string | null>(current ?? fits ?? plans[0]?.code ?? null);
  const fail = (error?: string, reason?: string) =>
    setMessage({
      ok: false,
      text: error === "room" ? B.room : error === "off" ? B.cardOff : reason ? `${B.stripeSaid}: ${reason}` : t.errors.generic,
    });

  function pay(code: string) {
    setMessage(null);
    setBusy(code);
    startTransition(async () => {
      const result = await payByCard(code, period);
      if (result.url) window.location.assign(result.url);
      else {
        setBusy(null);
        fail(result.error, result.reason);
      }
    });
  }

  function change(code: string) {
    if (!window.confirm(B.changeConfirm)) return;
    setMessage(null);
    setBusy(code);
    startTransition(async () => {
      const result = await changePlan(code, period);
      setBusy(null);
      if (result.ok) setMessage({ ok: true, text: B.changed });
      else fail(result.error, result.reason);
    });
  }

  function invoice(code: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await requestPlan(code);
      if (result.ok) setAsked(code);
      else fail();
    });
  }

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1 text-sm font-medium" role="radiogroup">
        {(["month", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={period === value}
            onClick={() => setPeriod(value)}
            className={`rounded-lg px-3 py-1.5 transition ${period === value ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised"}`}
          >
            {value === "month" ? B.monthly : B.yearly}
            {value === "year" && <span className={`ml-1.5 text-xs ${period === value ? "text-on-accent/80" : "text-success"}`}>{B.yearlySave}</span>}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={B.plans}>
        {plans.map((p) => {
          const mine = p.code === current && (!card.subscribed || card.interval === period);
          const best = p.code === picked;
          const price = priceFor(p, period);
          return (
            <li
              key={p.code}
              role="radio"
              aria-checked={best}
              tabIndex={0}
              onClick={() => setPicked(p.code)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPicked(p.code);
                }
              }}
              className={`flex cursor-pointer flex-col rounded-2xl border bg-surface p-5 shadow-xs transition focus-visible:outline-2 focus-visible:outline-accent ${best ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-line-strong"}`}
            >
              {mine ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-fg">{B.current}</p>
              ) : !current && p.code === fits ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">{B.fitsYou}</p>
              ) : null}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Users className="size-4" />
                {p.max_people === null ? B.unlimited : p.max_people === 1 ? B.upToOne : fmt(B.upTo, { n: p.max_people })}
              </p>
              <p className="mt-4">
                <span className="text-3xl font-bold tracking-tight">{formatPrice(price, "EUR", lang)}</span>
                <span className="ml-1 text-sm text-muted">{period === "year" ? B.perYear : B.perMonth}</span>
              </p>
              {period === "year" && (
                <p className="mt-1 text-xs text-muted">{fmt(B.yearEquals, { price: formatPrice(price / 12, "EUR", lang) ?? "", months: YEAR_MONTHS })}</p>
              )}

              {canRequest && !mine && (
                <div className="mt-5 space-y-2">
                  {card.on ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => (card.subscribed ? change(p.code) : pay(p.code))}
                      className={`${best ? buttonClass.primary : buttonClass.secondary} w-full`}
                    >
                      {busy === p.code ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                      {card.subscribed ? B.switchTo : B.payCard}
                    </button>
                  ) : null}
                  {!card.subscribed && (
                    <button
                      type="button"
                      disabled={pending || asked !== null}
                      onClick={() => invoice(p.code)}
                      className={card.on ? "w-full rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-fg disabled:opacity-60" : `${best ? buttonClass.primary : buttonClass.secondary} w-full`}
                    >
                      {asked === p.code ? <Check className="mr-1 inline size-4" /> : null}
                      {card.on ? B.wantInvoice : B.want}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {card.on && canRequest && <p className="mt-3 text-xs text-muted">{B.secure}</p>}
      {asked && <p className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">{B.requested}</p>}
      {message && <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{message.text}</p>}
    </div>
  );
}
