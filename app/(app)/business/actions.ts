"use server";

import { revalidatePath } from "next/cache";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type FinanceSettings } from "@/lib/business";
import { sofiaToday } from "@/lib/dates";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;

/** My share, "pay yourself first" and the monthly budget. */
export async function saveFinance(input: FinanceSettings): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  if (!pct(input.commissionShare) || !pct(input.savingsPercent)) return { ok: false };
  if (input.savingsGoal !== null && (!Number.isFinite(input.savingsGoal) || input.savingsGoal < 0 || input.savingsGoal > 100_000_000)) return { ok: false };
  if (input.savingsGoalName.length > 120) return { ok: false };
  const budget: Partial<Record<ExpenseCategory, number>> = {};
  for (const c of EXPENSE_CATEGORIES) {
    const v = Number(input.budget[c] ?? 0);
    if (!Number.isFinite(v) || v < 0 || v > 10_000_000) return { ok: false };
    if (v > 0) budget[c] = Math.round(v);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("broker_finance").upsert(
    {
      profile_id: session.userId,
      organization_id: session.organizationId,
      commission_share: input.commissionShare,
      savings_percent: input.savingsPercent,
      savings_goal: input.savingsGoal,
      savings_goal_name: input.savingsGoalName.trim() || null,
      budget,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );
  if (error) console.error("Saving my business settings failed:", error.message);
  revalidatePath("/business");
  return { ok: !error };
}

export async function addExpense(input: { spentOn: string; category: string; amount: number; note: string }): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) return { ok: false };
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000_000) return { ok: false };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.spentOn) && !Number.isNaN(Date.parse(input.spentOn)) ? input.spentOn : sofiaToday();

  const supabase = await createClient();
  const { error } = await supabase.from("broker_expenses").insert({
    organization_id: session.organizationId,
    profile_id: session.userId,
    spent_on: day,
    category: input.category,
    amount: Math.round(input.amount * 100) / 100,
    note: input.note.trim().slice(0, 300) || null,
  });
  if (error) console.error("Adding an expense failed:", error.message);
  revalidatePath("/business");
  return { ok: !error };
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("broker_expenses").delete().eq("id", id);
  revalidatePath("/business");
  return { ok: !error };
}
