"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { savePlan } from "@/app/(app)/plan/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { formatNumber, formatPrice } from "@/lib/format";
import { RATE_LIMITS, planNumbers, type PlanRates, type RateSource } from "@/lib/game";
import { fmt } from "@/lib/i18n/dictionaries";

type Inputs = {
  goal: number | null;
  managerTarget: number;
  bigWhy: string | null;
  earned: number;
  rates: Record<keyof PlanRates, { value: number; source: RateSource }>;
  workDaysLeft: number;
};

const STEP: Record<keyof PlanRates, number> = { avgCommission: 100, viewingsPerDeal: 0.5, callsPerViewing: 0.5, listingsPerDeal: 0.1 };
const RATE_KEYS: (keyof PlanRates)[] = ["avgCommission", "viewingsPerDeal", "callsPerViewing", "listingsPerDeal"];

/**
 * The business plan as a simulator: the goal for the year worked backwards into deals, viewings and calls
 * (from the broker's own rates), with sliders to try "what if I got better at…".
 */
export function PlanSimulator({ inputs }: { inputs: Inputs }) {
  const { t, lang } = useI18n();
  const real = Object.fromEntries(RATE_KEYS.map((k) => [k, inputs.rates[k].value])) as PlanRates;
  const [goalText, setGoalText] = useState(inputs.goal === null ? "" : String(Math.round(inputs.goal)));
  const [why, setWhy] = useState(inputs.bigWhy ?? "");
  const [rates, setRates] = useState<PlanRates>(real);
  const [saved, setSaved] = useState<"idle" | "ok" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const parsed = Number(goalText.replace(/[\s,.]/g, ""));
  const goal = goalText.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  const plan = goal !== null ? planNumbers(goal, inputs.earned, rates, inputs.workDaysLeft) : null;
  const changed = RATE_KEYS.some((k) => rates[k] !== real[k]);
  const euro = (n: number) => formatPrice(n, "EUR", lang) ?? "0";
  const sliderMax = Math.max(300_000, (goal ?? 0) * 1.5);

  const sourceLabel: Record<RateSource, string> = {
    own: t.game.sourceOwn,
    agency: t.game.sourceAgency,
    default: t.game.sourceDefault,
  };
  const rateLabel: Record<keyof PlanRates, string> = {
    avgCommission: t.game.rateAvgCommission,
    viewingsPerDeal: t.game.rateViewingsPerDeal,
    callsPerViewing: t.game.rateCallsPerViewing,
    listingsPerDeal: t.game.rateListingsPerDeal,
  };
  const rateText = (k: keyof PlanRates, v: number) => (k === "avgCommission" ? euro(v) : (formatNumber(v, lang, 1) ?? "0"));

  function save() {
    setSaved("idle");
    startTransition(async () => {
      const result = await savePlan(goal, why);
      setSaved(result.ok ? "ok" : "error");
    });
  }

  // the funnel, widest first: calls → viewings → deals → the money
  const funnel = plan
    ? [
        { label: t.game.needCalls, value: formatNumber(plan.calls, lang), hint: fmt(t.game.perDay, { n: plan.perDay.calls }) },
        { label: t.game.needViewings, value: formatNumber(plan.viewings, lang), hint: fmt(t.game.perWeek, { n: plan.perWeek.viewings }) },
        { label: t.game.needDeals, value: formatNumber(plan.deals, lang), hint: fmt(t.game.perMonth, { n: plan.perMonth.deals }) },
        { label: t.stats.commission, value: euro(plan.remaining), hint: "" },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ---- the goal ---- */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <h2 className="text-base font-semibold">{t.game.planTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.game.planHint}</p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.game.goal}</span>
          <input
            inputMode="numeric"
            value={goalText}
            onChange={(e) => {
              setGoalText(e.target.value.replace(/[^\d\s]/g, ""));
              setSaved("idle");
            }}
            placeholder="60 000"
            className={`${inputClass} text-lg font-bold tabular-nums`}
          />
        </label>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={1000}
          value={goal ?? 0}
          onChange={(e) => {
            setGoalText(e.target.value);
            setSaved("idle");
          }}
          aria-label={t.game.goal}
          className="mt-3 w-full accent-accent"
        />
        {inputs.managerTarget > 0 && (
          <p className="mt-1 text-xs text-muted">{fmt(t.game.goalManager, { amount: euro(inputs.managerTarget) })}</p>
        )}

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.game.why}</span>
          <textarea
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              setSaved("idle");
            }}
            rows={2}
            maxLength={500}
            placeholder={t.game.whyPlaceholder}
            className={inputClass}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t.game.save}
          </button>
          {saved === "ok" && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
              <Check className="size-4" />
              {t.game.saved}
            </span>
          )}
          {saved === "error" && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
        </div>
      </section>

      {/* ---- what it takes ---- */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">{t.game.earned}</h2>
          <span className="text-lg font-bold tabular-nums">{euro(inputs.earned)}</span>
        </div>
        {goal !== null && goal > 0 && (
          <>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-raised">
              <div
                className={`h-full rounded-full ${inputs.earned >= goal ? "bg-success" : "bg-gradient-to-r from-accent to-brand-cyan"}`}
                style={{ width: `${Math.min(100, (inputs.earned / goal) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {plan && plan.remaining > 0 ? fmt(t.game.remaining, { amount: euro(plan.remaining) }) : t.game.goalReached}
            </p>
          </>
        )}

        {!plan ? (
          <p className="mt-6 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">{t.game.noGoal}</p>
        ) : plan.remaining > 0 ? (
          <>
            <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-subtle">{t.game.needTitle}</p>
            <ol className="space-y-1.5">
              {funnel.map((step, i) => (
                <li key={step.label} className="flex justify-center">
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-accent/20 to-brand-cyan/20 px-4 py-2.5 ring-1 ring-accent/25"
                    style={{ width: `${100 - i * 12}%` }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{step.label}</span>
                      {step.hint && <span className="block truncate text-[11px] text-muted">{step.hint}</span>}
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums">{step.value}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-raised/60 px-4 py-2.5">
              <span className="text-sm font-semibold">{t.game.needListings}</span>
              <span className="text-right">
                <span className="block text-lg font-bold tabular-nums">{formatNumber(plan.listings, lang)}</span>
                <span className="block text-[11px] text-muted">{fmt(t.game.perMonth, { n: plan.perMonth.listings })}</span>
              </span>
            </div>
            <p className="mt-3 text-xs text-subtle">{fmt(t.game.workDaysLeft, { n: inputs.workDaysLeft })}</p>
          </>
        ) : (
          <p className="mt-6 rounded-xl bg-success/10 px-4 py-6 text-center text-sm font-semibold text-success">{t.game.goalReached}</p>
        )}
      </section>

      {/* ---- the rates: try "what if" ---- */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t.game.ratesTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.game.ratesHint}</p>
          </div>
          {changed && (
            <button type="button" onClick={() => setRates(real)} className={buttonClass.ghost}>
              <RotateCcw className="size-4" />
              {t.game.reset}
            </button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {RATE_KEYS.map((k) => (
            <label key={k} className="block">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-fg-2">{rateLabel[k]}</span>
                <span className={`font-bold tabular-nums ${rates[k] !== real[k] ? "text-accent-fg" : ""}`}>{rateText(k, rates[k])}</span>
              </span>
              <input
                type="range"
                min={RATE_LIMITS[k][0]}
                max={k === "avgCommission" ? Math.max(20_000, real[k] * 3) : RATE_LIMITS[k][1]}
                step={STEP[k]}
                value={rates[k]}
                onChange={(e) => setRates((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                className="mt-2 w-full accent-accent"
              />
              <span className="text-[11px] text-subtle">
                {rateText(k, real[k])} · {sourceLabel[inputs.rates[k].source]}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
