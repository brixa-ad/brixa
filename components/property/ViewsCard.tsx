import Link from "next/link";
import { Eye, Globe, Image as ImageIcon, Link2, Play } from "lucide-react";
import { Card } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

/** The listing's views: how many opened it, looked at the photos, played the video. */
export type ViewTotals = { opens: number; photos: number; video: number };

/** One opening: of a link sent (to whom) or of the agency's website. */
export type ViewRow = {
  id: string;
  who: string | null;
  href: string | null;
  site: boolean;
  at: string;
  seconds: number;
  photos: number;
  video: boolean;
};

/** "2 мин" / "40 сек" — how long the page was looked at. */
function duration(seconds: number, t: Dictionary) {
  return seconds >= 60 ? fmt(t.views.minutes, { n: Math.round(seconds / 60) }) : fmt(t.views.seconds, { n: seconds });
}

/** Who opened the listing (the links sent, the website), when, how long, the photos and the video. */
export function ViewsCard({ totals, rows, t, lang }: { totals: ViewTotals; rows: ViewRow[]; t: Dictionary; lang: Lang }) {
  const V = t.views;
  return (
    <Card
      id="views"
      title={
        <span className="flex items-center gap-2">
          <Eye className="size-4 text-brand-cyan" />
          {V.title}
        </span>
      }
      description={V.hint}
    >
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            [V.opened, totals.opens, Eye],
            [V.photos, totals.photos, ImageIcon],
            [V.video, totals.video, Play],
          ] as const
        ).map(([name, value, Icon]) => (
          <div key={name} className="rounded-xl bg-raised/60 px-3 py-2">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted">
              <Icon className="size-3" />
              {name}
            </dt>
            <dd className="text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{V.none}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line-soft">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-raised text-muted">
                {row.site ? <Globe className="size-3.5" /> : <Link2 className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.href ? (
                    <Link href={row.href} className="hover:text-accent-fg">
                      {row.who}
                    </Link>
                  ) : (
                    (row.who ?? (row.site ? V.siteVisitor : t.share.anyone))
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                  <span>{formatDate(row.at, lang, true)}</span>
                  {row.seconds > 0 && <span>· {duration(row.seconds, t)}</span>}
                  <span className={row.photos >= 2 ? "font-medium text-success" : ""}>
                    · {row.photos >= 2 ? fmt(V.sawPhotos, { n: row.photos }) : V.onlyOpened}
                  </span>
                  {row.video && <span className="font-medium text-success">· {V.played}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
