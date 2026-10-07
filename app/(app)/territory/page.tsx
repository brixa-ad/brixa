import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Eye, Handshake, Home, Map as MapIcon, Star } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { TERRITORY_POINTS, getTerritories, pointsOf, territoryLevel, type Territory } from "@/lib/territory";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.territory.title };
}

// none, step, presence, strong, leader, owner
const LEVEL_STYLE = [
  "border-line bg-surface",
  "border-sky-500/30 bg-sky-500/5",
  "border-accent/40 bg-accent-soft/40",
  "border-violet-500/40 bg-violet-500/10",
  "border-brand-cyan/50 bg-brand-cyan/10",
  "border-[#f5c542]/60 bg-[#f5c542]/10",
];
const CHIP_STYLE = [
  "bg-raised text-muted",
  "bg-sky-500/15 text-sky-500",
  "bg-accent text-on-accent",
  "bg-violet-500 text-white",
  "bg-brand-cyan text-[#040915]",
  "bg-[#f5c542] text-[#3b2a00]",
];

/** The neighbourhoods as territories: the more listings and deals there, the more it's yours. */
export default async function TerritoryPage({ searchParams }: PageProps<"/territory">) {
  const { view } = await searchParams;
  const agencyView = view === "agency";
  const session = (await getSession())!;
  const [{ t }, all] = await Promise.all([getI18n(), getTerritories(session)]);

  const pts = (x: Territory) => pointsOf(agencyView ? x.agency : x.mine);
  const shown = all.filter((x) => pts(x) > 0);
  const towns = [...new Set(shown.map((x) => x.town))];
  const strongest = [...all].filter((x) => pointsOf(x.mine) > 0).sort((a, b) => pointsOf(b.mine) - pointsOf(a.mine))[0];
  const strongestLevel = strongest ? territoryLevel(pointsOf(strongest.mine)) : null;

  const tab = (active: boolean) =>
    `flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition ${active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`;

  return (
    <>
      <PageHeader title={t.territory.title} subtitle={t.territory.subtitle} />

      {/* working alone, "the agency" is just me */}
      {!session.solo && (
      <nav className="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-80">
        <Link href="/territory" className={tab(!agencyView)} aria-current={!agencyView ? "page" : undefined}>
          {t.territory.me}
        </Link>
        <Link href="/territory?view=agency" className={tab(agencyView)} aria-current={agencyView ? "page" : undefined}>
          {t.territory.agency}
        </Link>
      </nav>
      )}

      {/* where I stand, and the next step */}
      {!agencyView && strongest && strongestLevel && (
        <div className="mb-5 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-semibold">
            {fmt(t.territory.summary, { count: all.filter((x) => pointsOf(x.mine) > 0).length, name: strongest.name })}
          </p>
          {strongestLevel.next !== null && (
            <p className="mt-1 text-fg-2">
              {fmt(t.territory.nextStep, {
                points: strongestLevel.next - pointsOf(strongest.mine),
                level: t.territory.levels[strongestLevel.index + 1],
                name: strongest.name,
              })}
            </p>
          )}
        </div>
      )}
      <p className="mb-5 text-xs text-subtle">
        {fmt(t.territory.howTo, {
          deal: TERRITORY_POINTS.deal,
          listing: TERRITORY_POINTS.listing,
          exclusive: TERRITORY_POINTS.exclusive,
          viewing: TERRITORY_POINTS.viewing,
        })}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <MapIcon className="mx-auto size-10 text-faint" />
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">{agencyView ? t.territory.emptyAgency : t.territory.empty}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {towns.map((town) => (
            <section key={town}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">{town}</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown
                  .filter((x) => x.town === town)
                  .sort((a, b) => pts(b) - pts(a))
                  .map((x) => {
                    const points = pts(x);
                    const level = territoryLevel(points);
                    const c = agencyView ? x.agency : x.mine;
                    const leader = x.ranking[0];
                    const myRank = x.ranking.findIndex((r) => r.profileId === session.userId);
                    return (
                      <li key={x.id} className={`rounded-2xl border p-4 ${LEVEL_STYLE[level.index + 1]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate font-semibold">{x.name}</p>
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CHIP_STYLE[level.index + 1]}`}>
                            {level.index >= 0 ? t.territory.levels[level.index] : "—"}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                          <div className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan" style={{ width: `${Math.max(3, level.progress * 100)}%` }} />
                        </div>
                        <p className="mt-1 flex justify-between text-[11px] text-muted">
                          <span className="font-semibold tabular-nums text-fg-2">{fmt(t.territory.points, { n: points })}</span>
                          {level.next !== null && <span>{fmt(t.territory.toNext, { n: level.next - points })}</span>}
                        </p>
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2">
                          <span className="inline-flex items-center gap-1" title={t.territory.listings}>
                            <Home className="size-3.5 text-subtle" />
                            {c.listings}
                          </span>
                          {c.exclusives > 0 && (
                            <span className="inline-flex items-center gap-1" title={t.territory.exclusives}>
                              <Star className="size-3.5 text-warning" />
                              {c.exclusives}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1" title={t.territory.deals}>
                            <Handshake className="size-3.5 text-subtle" />
                            {c.deals}
                          </span>
                          <span className="inline-flex items-center gap-1" title={t.territory.viewings}>
                            <Eye className="size-3.5 text-subtle" />
                            {c.viewings}
                          </span>
                        </p>
                        {leader && (
                          <p className="mt-2 flex items-center gap-1.5 border-t border-line-soft pt-2 text-xs">
                            <Crown className="size-3.5 shrink-0 text-[#f5c542]" />
                            <span className="min-w-0 truncate font-medium">{leader.profileId === session.userId ? t.territory.you : leader.name}</span>
                            {!agencyView && myRank > 0 && (
                              <span className="ml-auto shrink-0 text-muted">{fmt(t.territory.yourRank, { n: myRank + 1 })}</span>
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
