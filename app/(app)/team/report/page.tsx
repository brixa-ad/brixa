import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { addDays, sofiaToday } from "@/lib/dates";
import { formatDayMonth, formatNumber, formatPrice } from "@/lib/format";
import { fmt, type Lang } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getHierarchy } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.teamReport };
}

const METRICS = ["calls", "meetings", "viewings", "new_clients", "listings", "deals", "commission"] as const;
type Metric = (typeof METRICS)[number];
type Row = {
  profile_id: string;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
  office_id: string | null;
  team_id: string | null;
} & Record<Metric | `prev_${Metric}`, number | string>;

/** The Monday of the week a day falls in. */
function mondayOf(day: string) {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

const sum = (rows: Row[], key: Metric | `prev_${Metric}`) => rows.reduce((total, r) => total + Number(r[key] ?? 0), 0);

function Delta({ now, before, money, lang }: { now: number; before: number; money: boolean; lang: Lang }) {
  const diff = now - before;
  if (diff === 0) return null;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  const value = money ? formatPrice(Math.abs(diff), "EUR", lang) : formatNumber(Math.abs(diff), lang);
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold ${diff > 0 ? "text-success" : "text-danger"}`}>
      <Icon className="size-3" />
      {value}
    </span>
  );
}

/** A leader's week: what each person they lead did, against the week before — by office and team. */
export default async function TeamReportPage({ searchParams }: PageProps<"/team/report">) {
  const session = (await getSession())!;
  if (!session.isManager) redirect("/team");
  const params = await searchParams;
  const today = sofiaToday();
  const thisMonday = mondayOf(today);
  const asked = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? mondayOf(params.week) : thisMonday;
  const monday = asked > thisMonday ? thisMonday : asked;

  const supabase = await createClient();
  const [{ t, lang }, { data }, { offices, teams }] = await Promise.all([
    getI18n(),
    supabase.rpc("team_week", { target_org: session.organizationId, week_start: monday }),
    getHierarchy(supabase, session.organizationId),
  ]);
  const rows = (data ?? []) as Row[];
  const R = t.teamWeek;
  const label = (key: Metric) => R.metrics[key];
  const value = (key: Metric, n: number) => (key === "commission" ? formatPrice(n, "EUR", lang) : formatNumber(n, lang));

  // by office, then team (the order of the Team page)
  const groups: { title: string; rows: Row[] }[] = [];
  const teamName = (id: string | null) => teams.find((tm) => tm.id === id)?.name ?? null;
  for (const office of [...offices, null]) {
    const inOffice = rows.filter((r) => (r.office_id ?? null) === (office?.id ?? null));
    if (inOffice.length === 0) continue;
    const teamIds = [...new Set(inOffice.map((r) => r.team_id))];
    for (const teamId of teamIds) {
      const part = inOffice.filter((r) => r.team_id === teamId);
      const title = [office?.name ?? (offices.length > 0 ? t.team.noOffice : null), teamName(teamId) ?? (teams.length > 0 ? t.team.noTeam : null)]
        .filter(Boolean)
        .join(" · ");
      groups.push({ title, rows: part });
    }
  }

  const range = `${formatDayMonth(monday, lang)} – ${formatDayMonth(addDays(monday, 6), lang)}`;
  const quiet = (r: Row) => Number(r.calls) + Number(r.meetings) + Number(r.viewings) === 0;

  return (
    <>
      <PageHeader title={t.nav.teamReport} subtitle={monday === thisMonday ? fmt(R.thisWeek, { range }) : range} />

      <nav className="mb-5 flex items-center gap-2 text-sm">
        <Link href={`/team/report?week=${addDays(monday, -7)}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-raised">
          <ChevronLeft className="size-4" />
          {R.previous}
        </Link>
        {monday < thisMonday && (
          <Link href={`/team/report?week=${addDays(monday, 7)}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-raised">
            {R.next}
            <ChevronRight className="size-4" />
          </Link>
        )}
      </nav>

      {/* the whole week, against the one before */}
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {METRICS.map((key) => (
          <div key={key} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{label(key)}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums">{value(key, sum(rows, key))}</span>
              <Delta now={sum(rows, key)} before={sum(rows, `prev_${key}`)} money={key === "commission"} lang={lang} />
            </dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{R.none}</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.title || "all"} className="p-0! sm:p-0!">
              {group.title && <h2 className="px-5 pt-5 text-base font-semibold sm:px-6">{group.title}</h2>}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-xs text-muted">
                      <th className="px-5 py-2 font-medium sm:px-6">{R.person}</th>
                      {METRICS.map((key) => (
                        <th key={key} className="px-2 py-2 text-right font-medium">
                          {label(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {group.rows.map((r) => (
                      <tr key={r.profile_id} className={quiet(r) ? "bg-warning/5" : undefined}>
                        <td className="px-5 py-2.5 sm:px-6">
                          <Link href={`/team/${r.profile_id}`} className="flex items-center gap-2 font-medium hover:text-accent-fg">
                            <Avatar path={r.avatar_path} name={r.full_name || r.email} size="sm" />
                            <span className="truncate">{r.full_name || r.email}</span>
                            {quiet(r) && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">{R.quiet}</span>}
                          </Link>
                        </td>
                        {METRICS.map((key) => (
                          <td key={key} className="px-2 py-2.5 text-right tabular-nums">
                            <span className="block font-semibold">{value(key, Number(r[key]))}</span>
                            <Delta now={Number(r[key])} before={Number(r[`prev_${key}`])} money={key === "commission"} lang={lang} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {group.rows.length > 1 && (
                    <tfoot>
                      <tr className="border-t border-line text-xs font-semibold text-fg-2">
                        <td className="px-5 py-2 sm:px-6">{R.together}</td>
                        {METRICS.map((key) => (
                          <td key={key} className="px-2 py-2 text-right tabular-nums">
                            {value(key, sum(group.rows, key))}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          ))}
          <p className="text-xs text-subtle">{R.hint}</p>
        </div>
      )}
    </>
  );
}
