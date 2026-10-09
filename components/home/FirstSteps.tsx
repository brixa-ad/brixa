"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Rocket, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/ui/Modal";
import { fmt } from "@/lib/i18n/dictionaries";
import { firstStepsText } from "@/lib/i18n/first-steps";
import type { FirstStep } from "@/lib/first-steps";
import { SampleOffer } from "@/components/SampleData";

const key = (userId: string) => `brixa.firstSteps.hidden.${userId}`;

function readHidden(userId: string) {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

/** The owner's checklist after signing up; gone once everything is done or it is hidden. */
export function FirstSteps({ userId, steps, sampleOffer = false, solo = false }: { userId: string; steps: FirstStep[]; sampleOffer?: boolean; solo?: boolean }) {
  const t = { firstSteps: firstStepsText[useI18n().lang] };
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);
  const done = steps.filter((s) => s.done).length;

  if (!mounted || closed || done === steps.length || readHidden(userId)) return null;

  const hide = () => {
    try {
      localStorage.setItem(key(userId), "1");
    } catch {}
    setClosed(true);
  };

  return (
    <section className="rounded-2xl border border-accent/40 bg-surface p-5 shadow-xs sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Rocket className="size-4 text-brand-cyan" />
            {t.firstSteps.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{fmt(t.firstSteps.progress, { done, total: steps.length })}</p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="-m-1 rounded-lg p-1.5 text-subtle transition hover:bg-raised hover:text-fg"
          aria-label={t.firstSteps.hide}
          title={t.firstSteps.hide}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="-mx-3 mt-3">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-raised"
            >
              {step.done ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <Circle className="size-5 shrink-0 text-subtle" />}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.done ? "text-muted line-through" : ""}`}>{t.firstSteps[solo && step.key === "logo" ? "logoSolo" : step.key]}</span>
                {!step.done && <span className="block text-xs text-muted">{t.firstSteps[solo && step.key === "logo" ? "logoSoloHint" : `${step.key}Hint`]}</span>}
              </span>
              {!step.done && <ChevronRight className="size-4 shrink-0 text-subtle" />}
            </Link>
          </li>
        ))}
      </ul>
      {sampleOffer && <SampleOffer />}
    </section>
  );
}
