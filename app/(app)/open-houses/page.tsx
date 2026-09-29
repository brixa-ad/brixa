import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, DoorOpen, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { OPEN_HOUSE_SELECT, hhmm, placeOf, weekdayDate, type OpenHouse } from "@/lib/open-houses";
import { personName } from "@/lib/tasks";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.openHouses.title };
}

/** The agency's open houses: what's coming, and how the past ones went. */
export default async function OpenHousesPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const today = sofiaToday();
  const [{ t, lang }, { data }, { data: visitorRows }] = await Promise.all([
    getI18n(),
    supabase
      .from("open_houses")
      .select(OPEN_HOUSE_SELECT)
      .eq("organization_id", session.organizationId)
      .order("day", { ascending: false })
      .order("starts_at")
      .limit(200),
    // only the host's and (for managers) everyone's — the rest see no counts
    supabase.from("open_house_visitors").select("open_house_id").eq("organization_id", session.organizationId).limit(10000),
  ]);
  const houses = (data ?? []) as unknown as OpenHouse[];
  const visitors = new Map<string, number>();
  for (const v of visitorRows ?? []) visitors.set(v.open_house_id, (visitors.get(v.open_house_id) ?? 0) + 1);

  const upcoming = houses.filter((h) => h.day >= today && !h.cancelled_at).reverse();
  const past = houses.filter((h) => h.day < today || h.cancelled_at);

  const row = (h: OpenHouse) => (
    <li key={h.id}>
      <Link href={`/open-houses/${h.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-raised">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">
          <DoorOpen className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold ${h.cancelled_at ? "text-muted line-through" : ""}`}>{h.property?.title ?? "—"}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1 capitalize">
              <CalendarDays className="size-3.5" />
              {fmt(t.openHouses.when, { day: weekdayDate(h.day, lang), from: hhmm(h.starts_at), to: hhmm(h.ends_at) })}
            </span>
            {placeOf(h.property) && <span>{placeOf(h.property)}</span>}
            <span>{personName(h.host)}</span>
          </span>
        </span>
        {h.cancelled_at ? (
          <span className="shrink-0 rounded-md bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{t.openHouses.cancelledBadge}</span>
        ) : (visitors.get(h.id) ?? 0) > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
            <Users className="size-4 text-brand-cyan" />
            {visitors.get(h.id)}
          </span>
        ) : null}
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        title={t.openHouses.title}
        subtitle={t.openHouses.subtitle}
        actions={
          <Link href="/open-houses/new" className={buttonClass.primary}>
            <Plus className="size-4" />
            {t.openHouses.new}
          </Link>
        }
      />

      {houses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <DoorOpen className="mx-auto size-10 text-faint" />
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">{t.openHouses.empty}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-2 shadow-xs sm:p-3">
              <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t.openHouses.upcoming}</h2>
              <ul>{upcoming.map(row)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-2 shadow-xs sm:p-3">
              <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t.openHouses.past}</h2>
              <ul>{past.map(row)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
