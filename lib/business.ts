/** My business: the expense categories (shared by the page and the forms). */
export const EXPENSE_CATEGORIES = ["marketing", "transport", "phone", "education", "office", "clients", "fees", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type FinanceSettings = {
  commissionShare: number;
  savingsPercent: number;
  savingsGoal: number | null;
  savingsGoalName: string;
  budget: Partial<Record<ExpenseCategory, number>>;
};

export const DEFAULT_FINANCE: FinanceSettings = {
  commissionShare: 100,
  savingsPercent: 10,
  savingsGoal: null,
  savingsGoalName: "",
  budget: {},
};
