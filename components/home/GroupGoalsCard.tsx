import { Flag } from "lucide-react";
import { Card } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

export type GroupGoalProgress = { scope: "agency" | "office" | "team"; name: string; target: number; reached: number; people: number };

/** The month's goals of the agency, my office and my team — and how far we've come. */
export function GroupGoalsCard({ goals, t, lang }: { goals: GroupGoalProgress[]; t: Dictionary; lang: Lang }) {
  if (goals.length === 0) return null;
  const G = t.groupGoals;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Flag className="size-4 text-brand-cyan" />
          {G.homeTitle}
        </span>
      }
    >
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {goals.map((g) => {
          const percent = g.target > 0 ? Math.min(100, (g.reached / g.target) * 100) : 0;
          return (
            <li key={`${g.scope}-${g.name}`} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{G[g.scope]}</span>
                  {g.scope === "agency" ? "" : g.name}
                </p>
                <span className={`shrink-0 text-xs font-bold ${percent >= 100 ? "text-success" : "text-accent-fg"}`}>{Math.round(percent)}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className={`h-full rounded-full ${percent >= 100 ? "bg-success" : "bg-gradient-to-r from-accent to-brand-cyan"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {fmt(G.reached, { reached: formatPrice(g.reached, "EUR", lang) ?? "", target: formatPrice(g.target, "EUR", lang) ?? "" })}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
