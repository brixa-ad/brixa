import Link from "next/link";
import { PrintButton } from "@/components/PublicPageTools";
import { buttonClass, inputClass } from "@/components/ui/form";
import type { Dictionary, Lang } from "@/lib/i18n/dictionaries";
import { STAT_PERIODS, rangeParams, rangeText, type StatPeriod, type StatRange } from "@/lib/period";

export type StatsTab = "agency" | "market" | "broker";

const TAB_HREF: Record<StatsTab, string> = { agency: "/stats", market: "/stats/market", broker: "/stats/broker" };

function href(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ""));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * The statistics' header: the period (month, 6 months, year, any range
 * with the calendar) and the PDF document. `keep` carries a tab's own filters along.
 */
export function StatsNav({
  tab,
  range,
  keep = {},
  title,
  subtitle,
  agencyName,
  t,
  lang,
}: {
  tab: StatsTab;
  range: StatRange;
  keep?: Record<string, string>;
  title: string;
  subtitle?: string;
  agencyName: string;
  /** the agency's numbers are for the managers */
  showAgency?: boolean;
  t: Dictionary;
  lang: Lang;
}) {
  const periodNames: Record<StatPeriod, string> = {
    month: t.stats.periodMonth,
    "6m": t.stats.period6m,
    year: t.stats.periodYear,
    custom: t.stats.periodCustom,
  };

  return (
    <>
      {/* on paper: whose, what, for when */}
      <div className="mb-6 hidden border-b border-line pb-3 print:block">
        <p className="text-sm text-muted">{agencyName}</p>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-fg-2">{rangeText(range, lang)}</p>
        {subtitle && <p className="text-sm text-fg-2">{subtitle}</p>}
      </div>

      <div className="mb-5 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {STAT_PERIODS.filter((p) => p !== "custom").map((key) => (
              <Link
                key={key}
                href={href(TAB_HREF[tab], { ...keep, ...rangeParams({ period: key, from: "", to: "" }) })}
                aria-current={range.period === key ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  range.period === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
                }`}
              >
                {periodNames[key]}
              </Link>
            ))}
          </nav>

          {/* any range, picked on the calendar */}
          <form action={TAB_HREF[tab]} className="flex flex-wrap items-center gap-2">
            {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <input type="hidden" name="period" value="custom" />
            <label className="flex items-center gap-1.5 text-xs text-muted">
              {t.stats.from}
              <input type="date" name="from" defaultValue={range.from} className={`${inputClass} w-auto py-1.5`} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              {t.stats.to}
              <input type="date" name="to" defaultValue={range.to} className={`${inputClass} w-auto py-1.5`} />
            </label>
            <button type="submit" className={`${buttonClass.secondary} py-1.5 ${range.period === "custom" ? "border-accent text-accent-fg" : ""}`}>
              {t.stats.show}
            </button>
          </form>

          <div className="ml-auto">
            <PrintButton label={t.stats.document} />
          </div>
        </div>
        <p className="text-xs text-subtle">{rangeText(range, lang)}</p>
      </div>
    </>
  );
}
