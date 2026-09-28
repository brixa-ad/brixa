import { CalendarRange } from "lucide-react";
import { Bar, CardTitle } from "@/components/stats/StatBits";
import { Card } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { locale, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

type Month = { month: string; count: number; commission: number; turnover: number };

/** Closed deals, turnover and commission, month by month. */
export function MonthsCard({ months, t, lang, className = "" }: { months: Month[]; t: Dictionary; lang: Lang; className?: string }) {
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "0";
  const name = (key: string) =>
    new Intl.DateTimeFormat(locale(lang), { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
  const max = Math.max(0, ...months.map((m) => m.commission));
  const grid = "grid grid-cols-[5.5rem_2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-2";

  return (
    <Card title={<CardTitle icon={CalendarRange}>{t.stats.byMonth}</CardTitle>} className={className}>
      {months.every((m) => m.count === 0) ? (
        <p className="text-sm text-muted">{t.stats.noMonths}</p>
      ) : (
        <>
          <div className={`${grid} mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle`}>
            <span />
            <span className="text-right">{t.stats.wonFrom}</span>
            <span className="text-right">{t.stats.turnover}</span>
            <span className="text-right">{t.stats.commission}</span>
          </div>
          <ul className="space-y-2.5">
            {months.map((m) => (
              <li key={m.month}>
                <div className={`${grid} text-sm`}>
                  <span className="truncate text-fg-2">{name(m.month)}</span>
                  <span className="text-right font-semibold tabular-nums">{m.count}</span>
                  <span className="truncate text-right tabular-nums text-muted">{m.count ? euro(m.turnover) : "—"}</span>
                  <span className="truncate text-right font-semibold tabular-nums">{m.count ? euro(m.commission) : "—"}</span>
                </div>
                {m.commission > 0 && (
                  <div className="mt-1">
                    <Bar value={m.commission} max={max} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
