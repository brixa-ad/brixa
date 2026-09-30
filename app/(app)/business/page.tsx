import type { Metadata } from "next";
import { Lock, PiggyBank, Receipt, SlidersHorizontal, TrafficCone } from "lucide-react";
import { DeleteExpense, ExpenseForm } from "@/components/business/ExpenseForm";
import { FinanceSettingsForm } from "@/components/business/FinanceSettingsForm";
import { PageHeader } from "@/components/PageHeader";
import { CardTitle, StatTiles } from "@/components/stats/StatBits";
import { Card } from "@/components/ui/form";
import { EXPENSE_CATEGORIES } from "@/lib/business";
import { getBusiness } from "@/lib/business-server";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.business.title };
}

/** The broker as a business (How to Get Rich in Real Estate): income, expenses, profit, pay yourself first. */
export default async function BusinessPage() {
  const session = (await getSession())!;
  const today = sofiaToday();
  const year = Number(today.slice(0, 4));
  const [{ t, lang }, b] = await Promise.all([getI18n(), getBusiness(session, year, today)]);

  const euro = (n: number) => formatPrice(Math.round(n), "EUR", lang) ?? "0";
  const monthName = (key: string) => {
    // "Яну", "Фев"… (the short form is a number in Bulgarian)
    const m = new Intl.DateTimeFormat(locale(lang), { month: "long", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
    return m.charAt(0).toUpperCase() + m.slice(1, 3);
  };
  const maxMonth = Math.max(1, ...b.months.map((m) => Math.max(m.income, m.spent)));
  const goal = b.settings.savingsGoal;
  const budgeted = EXPENSE_CATEGORIES.filter((c) => (b.settings.budget[c] ?? 0) > 0 || b.byCategory[c].month > 0);

  return (
    <>
      <PageHeader title={t.business.title} subtitle={t.business.subtitle} />
      <p className="-mt-3 mb-6 flex items-center gap-1.5 text-xs text-subtle">
        <Lock className="size-3.5" />
        {t.business.private}
      </p>

      <StatTiles
        tiles={[
          {
            label: `${t.business.income} ${year}`,
            value: euro(b.income),
            hint: b.pending > 0 ? fmt(t.business.pending, { amount: euro(b.pending) }) : fmt(t.business.incomeHint, { share: formatNumber(b.settings.commissionShare, lang) ?? "" }),
          },
          {
            label: t.business.spent,
            value: euro(b.spent),
            hint: b.expenseRatio !== null ? fmt(t.business.expenseRatio, { pct: formatNumber(b.expenseRatio * 100, lang) ?? "0" }) : undefined,
          },
          { label: t.business.net, value: euro(b.net) },
          {
            label: t.business.saved,
            value: euro(b.saved),
            hint: goal ? fmt(t.business.goalOf, { saved: euro(b.saved), goal: euro(goal) }) : fmt(t.business.savedHint, { pct: formatNumber(b.settings.savingsPercent, lang) ?? "0" }),
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- pay yourself first: towards the goal ---- */}
        <Card title={<CardTitle icon={PiggyBank}>{t.business.saved}</CardTitle>}>
          {goal ? (
            <>
              <p className="font-semibold">{b.settings.savingsGoalName || t.business.goalName}</p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan"
                  style={{ width: `${Math.min(100, Math.max(2, (b.saved / goal) * 100))}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm text-muted">{fmt(t.business.goalOf, { saved: euro(b.saved), goal: euro(goal) })}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t.business.goalNone}</p>
          )}
          <p className="mt-4 text-xs text-subtle">{t.business.savingsHint}</p>
          {b.expenseRatio !== null && <p className="mt-2 text-xs text-subtle">{t.business.expenseRatioHint}</p>}
        </Card>

        {/* ---- the budget: red light, green light ---- */}
        <Card title={<CardTitle icon={TrafficCone}>{t.business.budgetTitle}</CardTitle>} description={t.business.budgetHint}>
          {budgeted.length === 0 ? (
            <p className="text-sm text-muted">{t.business.noBudget}</p>
          ) : (
            <ul className="space-y-3">
              {budgeted.map((c) => {
                const limit = b.settings.budget[c] ?? 0;
                const used = b.byCategory[c].month;
                const over = limit > 0 && used > limit;
                return (
                  <li key={c}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-fg-2">
                        <span className={`size-2.5 shrink-0 rounded-full ${over ? "bg-danger" : "bg-success"}`} aria-hidden />
                        {t.business.categories[c]}
                      </span>
                      <span className={`tabular-nums ${over ? "font-semibold text-danger" : "font-semibold"}`}>
                        {limit > 0 ? `${euro(used)} / ${euro(limit)}` : euro(used)}
                      </span>
                    </div>
                    {limit > 0 && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                        <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-success"}`} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---- month by month ---- */}
        <Card title={t.business.monthsTitle} className="lg:col-span-2">
          <ul className="space-y-2.5">
            {b.months.map((m) => (
              <li key={m.month} className="grid grid-cols-[3rem_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm">
                <span className="text-muted">{monthName(m.month)}</span>
                <span className="space-y-1">
                  <span className="block h-2 rounded-full bg-gradient-to-r from-accent to-brand-cyan" style={{ width: `${(m.income / maxMonth) * 100}%` }} />
                  <span className="block h-2 rounded-full bg-danger/70" style={{ width: `${(m.spent / maxMonth) * 100}%` }} />
                </span>
                <span className={`text-right font-semibold tabular-nums ${m.net < 0 ? "text-danger" : ""}`}>{euro(m.net)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-gradient-to-r from-accent to-brand-cyan" />
              {t.business.income}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-danger/70" />
              {t.business.spent}
            </span>
            <span>= {t.business.net}</span>
          </p>
        </Card>

        {/* ---- the expenses ---- */}
        <Card title={<CardTitle icon={Receipt}>{t.business.expensesTitle}</CardTitle>} className="lg:col-span-2">
          <ExpenseForm today={today} />
          {b.expenses.length === 0 ? (
            <p className="mt-5 text-sm text-muted">{t.business.noExpenses}</p>
          ) : (
            <ul className="mt-5 divide-y divide-line-soft">
              {b.expenses.slice(0, 50).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">{formatDate(e.spent_on, lang)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.business.categories[e.category]}</span>
                    {e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{euro(e.amount)}</span>
                  <DeleteExpense id={e.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- my settings ---- */}
        <Card title={<CardTitle icon={SlidersHorizontal}>{t.business.settingsTitle}</CardTitle>} className="lg:col-span-2">
          <FinanceSettingsForm initial={b.settings} />
        </Card>
      </div>
    </>
  );
}
