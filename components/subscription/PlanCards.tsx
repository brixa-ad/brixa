"use client";

import { useState, useTransition } from "react";
import { Check, Users } from "lucide-react";
import { requestPlan } from "@/app/(app)/subscription/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import type { Plan } from "@/lib/subscription";

/** The packages side by side: up to how many people, the price, and (for the agency's owner) "I want it". */
export function PlanCards({
  plans,
  current,
  people,
  canRequest,
}: {
  plans: Plan[];
  current: string | null;
  /** how many the agency is now: the smallest package that fits is marked */
  people: number | null;
  canRequest: boolean;
}) {
  const { t, lang } = useI18n();
  const B = t.billing;
  const [asked, setAsked] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const fits = people === null ? null : plans.find((p) => p.max_people === null || p.max_people >= people)?.code ?? null;

  return (
    <div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const mine = p.code === current;
          const best = !current && p.code === fits;
          return (
            <li
              key={p.code}
              className={`flex flex-col rounded-2xl border bg-surface p-5 shadow-xs ${mine || best ? "border-accent ring-2 ring-accent/20" : "border-line"}`}
            >
              {mine && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-fg">{B.current}</p>}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Users className="size-4" />
                {p.max_people === null ? B.unlimited : p.max_people === 1 ? B.upToOne : fmt(B.upTo, { n: p.max_people })}
              </p>
              <p className="mt-4">
                <span className="text-3xl font-bold tracking-tight">{formatPrice(p.price_month, "EUR", lang)}</span>
                <span className="ml-1 text-sm text-muted">{B.perMonth}</span>
              </p>
              {canRequest && !mine && (
                <button
                  type="button"
                  disabled={pending || asked !== null}
                  onClick={() => {
                    setFailed(false);
                    startTransition(async () => {
                      const result = await requestPlan(p.code);
                      if (result.ok) setAsked(p.code);
                      else setFailed(true);
                    });
                  }}
                  className={`${best ? buttonClass.primary : buttonClass.secondary} mt-5 w-full`}
                >
                  {asked === p.code ? <Check className="size-4" /> : null}
                  {B.want}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {asked && <p className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">{B.requested}</p>}
      {failed && <p className="mt-4 text-sm text-danger">{t.errors.generic}</p>}
    </div>
  );
}
