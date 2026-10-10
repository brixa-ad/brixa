import Link from "next/link";
import { Clock } from "lucide-react";
import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";

/** One line: the trial's (or the paid time's) days left, and the packages. */
export function TrialBanner({ status, daysLeft, t }: { status: "trial" | "active"; daysLeft: number; t: Dictionary }) {
  const urgent = daysLeft <= 5;
  return (
    <Link
      href="/subscription"
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition print:hidden ${
        urgent ? "border-warning/40 bg-warning/10 text-fg hover:bg-warning/15" : "border-line bg-surface text-fg-2 hover:bg-raised"
      }`}
    >
      <Clock className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {status === "trial" ? (daysLeft <= 1 ? t.billing.trialLastDayShort : fmt(t.billing.trialLeftShort, { n: daysLeft })) : fmt(t.billing.paidLeftShort, { n: daysLeft })}
      </span>
      <span className="shrink-0 font-semibold text-accent-fg">{t.billing.plansShort} →</span>
    </Link>
  );
}
