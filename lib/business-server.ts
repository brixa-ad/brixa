import "server-only";
import { EXPENSE_CATEGORIES, DEFAULT_FINANCE, type ExpenseCategory, type FinanceSettings } from "./business";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export type Expense = { id: string; spent_on: string; category: ExpenseCategory; amount: number; note: string | null };

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

/**
 * A broker's year as a business (How to Get Rich in Real Estate): income (their share of the
 * commission of the deals they closed), expenses, the profit month by month, the budget this month,
 * and what "pay yourself first" puts aside.
 */
export async function getBusiness(session: SessionContext, year: number, today: string) {
  const supabase = await createClient();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [settingsRes, dealsRes, expensesRes] = await Promise.all([
    supabase.from("broker_finance").select("*").eq("profile_id", session.userId).maybeSingle(),
    supabase
      .from("deals")
      .select("commission:net_commission, closed_on, confirmed_at")
      .eq("organization_id", session.organizationId)
      .eq("broker_id", session.userId)
      .eq("status", "won")
      .gte("closed_on", from)
      .lte("closed_on", to),
    supabase
      .from("broker_expenses")
      .select("id, spent_on, category, amount, note")
      .eq("profile_id", session.userId)
      .gte("spent_on", from)
      .lte("spent_on", to)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const s = settingsRes.data;
  const settings: FinanceSettings = s
    ? {
        commissionShare: Number(s.commission_share),
        savingsPercent: Number(s.savings_percent),
        savingsGoal: s.savings_goal === null ? null : Number(s.savings_goal),
        savingsGoalName: s.savings_goal_name ?? "",
        budget: Object.fromEntries(
          Object.entries((s.budget ?? {}) as Record<string, unknown>)
            .filter(([key, value]) => (EXPENSE_CATEGORIES as readonly string[]).includes(key) && Number(value) > 0)
            .map(([key, value]) => [key, Number(value)])
        ),
      }
    : DEFAULT_FINANCE;

  const share = settings.commissionShare / 100;
  const deals = (dealsRes.data ?? []).map((d) => ({
    month: (d.closed_on as string).slice(0, 7),
    income: Number(d.commission ?? 0) * share,
    confirmed: Boolean(d.confirmed_at),
  }));
  const expenses = ((expensesRes.data ?? []) as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) }));

  // month by month (the whole year so far)
  const lastMonth = today.slice(0, 4) === String(year) ? Number(today.slice(5, 7)) : 12;
  const months = Array.from({ length: lastMonth }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const income = sum(deals.filter((d) => d.month === key).map((d) => d.income));
    const spent = sum(expenses.filter((e) => e.spent_on.startsWith(key)).map((e) => e.amount));
    return { month: key, income, spent, net: income - spent };
  });

  const income = sum(deals.map((d) => d.income));
  const spent = sum(expenses.map((e) => e.amount));
  const thisMonth = today.slice(0, 7);
  const byCategory = Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [
      c,
      {
        month: sum(expenses.filter((e) => e.category === c && e.spent_on.startsWith(thisMonth)).map((e) => e.amount)),
        year: sum(expenses.filter((e) => e.category === c).map((e) => e.amount)),
      },
    ])
  ) as Record<ExpenseCategory, { month: number; year: number }>;

  return {
    settings,
    income,
    pending: sum(deals.filter((d) => !d.confirmed).map((d) => d.income)),
    spent,
    net: income - spent,
    // what the expenses take out of the income (a warning when it grows)
    expenseRatio: income > 0 ? spent / income : null,
    saved: (income * settings.savingsPercent) / 100,
    months,
    byCategory,
    expenses,
  };
}

export type Business = Awaited<ReturnType<typeof getBusiness>>;
