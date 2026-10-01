import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { BadgeGrid } from "@/components/game/BadgeGrid";
import { PlayerCard } from "@/components/game/PlayerCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/property/StatusBadge";
import { Card, buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatPrice, settlementLabel } from "@/lib/format";
import { getPlayers } from "@/lib/game-server";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/team/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, email").eq("id", id).maybeSingle();
  return { title: data?.full_name || data?.email };
}

type PropertyRow = {
  id: string;
  title: string;
  status: string;
  current_price: number | null;
  currency: string;
  settlement: { name: string; settlement_type: string } | null;
};

export default async function MemberPage({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const session = (await getSession())!;
  const supabase = await createClient();
  const isSelf = id === session.userId;

  const [{ t, lang }, { data: membership }, { data: profile }, propertiesRes, { data: statRows }, players] = await Promise.all([
    getI18n(),
    supabase
      .from("organization_members")
      .select("role, created_at")
      .eq("organization_id", session.organizationId)
      .eq("profile_id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, email, phone, job_title, bio, areas, avatar_path")
      .eq("id", id)
      .maybeSingle(),
    // Listings are shared across the agency, so every colleague sees these.
    supabase
      .from("properties")
      .select("id, title, status, current_price, currency, settlement:geo_settlements(name, settlement_type)")
      .eq("organization_id", session.organizationId)
      .eq("responsible_broker_id", id)
      .order("updated_at", { ascending: false }),
    // Totals only (no clients) — every colleague may see them.
    supabase.rpc("member_stats", { target_profile: id, period: "year" }),
    // level, streak and badges — every colleague sees them
    getPlayers(session.organizationId, sofiaToday()),
  ]);
  const player = players.get(id);

  if (!membership || !profile) notFound();

  const role = membership.role as Role;
  const name = profile.full_name || profile.email;
  const properties = (propertiesRes.data ?? []) as unknown as PropertyRow[];

  const results = (statRows as Record<string, number | string>[] | null)?.[0] ?? null;
  const n = (key: string) => Number(results?.[key] ?? 0);
  // Their deals and clients open for managers (and for themselves); properties for everyone.
  const canOpenWork = session.isManager || isSelf;
  const dealsHref = (tab?: string) => {
    const qs = new URLSearchParams();
    if (tab) qs.set("tab", tab);
    if (!isSelf) qs.set("broker", id);
    const q = qs.toString();
    return q ? `/deals?${q}` : "/deals";
  };
  const propertiesHref = (status?: string) => `/properties?broker=${id}${status ? `&status=${status}` : ""}`;

  const counts = { total: properties.length, active: 0, reserved: 0, closed: 0 };
  for (const p of properties) {
    if (p.status === "active") counts.active++;
    if (p.status === "reserved") counts.reserved++;
    if (p.status === "sold" || p.status === "rented") counts.closed++;
  }

  return (
    <>
      <PageHeader backHref="/team" backLabel={t.nav.team} title={name} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ---- contact card ---- */}
        <Card className="h-fit">
          <div className="flex flex-col items-center text-center">
            <Avatar path={profile.avatar_path} name={name} size="xl" />
            <h2 className="mt-4 text-xl font-bold tracking-tight">{name}</h2>
            {profile.job_title && <p className="mt-0.5 text-sm text-fg-2">{profile.job_title}</p>}
            <span className="mt-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-fg">
              {t.roles[role]}
            </span>
            <p className="mt-3 text-xs text-subtle">
              {fmt(t.profile.memberSince, { date: formatDate(membership.created_at, lang) })}
            </p>
          </div>

          <div className="mt-6 space-y-2 border-t border-line-soft pt-5">
            {profile.phone && (
              <a
                href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-raised"
              >
                <Phone className="size-4 text-accent-fg" />
                <span className="font-medium">{profile.phone}</span>
              </a>
            )}
            <a
              href={`mailto:${profile.email}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-raised"
            >
              <Mail className="size-4 text-accent-fg" />
              <span className="truncate font-medium">{profile.email}</span>
            </a>
          </div>

          {isSelf && (
            <Link href="/profile" className={`${buttonClass.secondary} mt-5 w-full`}>
              <Pencil className="size-4" />
              {t.profile.edit}
            </Link>
          )}
        </Card>

        <div className="space-y-6">
          {player && (
            <div className="space-y-4">
              <PlayerCard player={player} t={t} lang={lang} href={isSelf ? "/plan" : undefined} />
              <Card title={t.game.badges}>
                <BadgeGrid stats={player.stats} t={t} lang={lang} />
              </Card>
            </div>
          )}

          {results && (
            <Card
              title={
                <span className="flex items-baseline gap-2">
                  {t.profile.resultsTitle}
                  <span className="text-sm font-normal text-muted">{t.profile.resultsYear}</span>
                </span>
              }
            >
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: t.profile.resultDeals, value: String(n("deals_won")), href: canOpenWork ? dealsHref("won") : null },
                  { label: t.profile.resultTurnover, value: formatPrice(n("turnover"), "EUR", lang) ?? "0", href: null },
                  { label: t.profile.resultCommission, value: formatPrice(n("commission"), "EUR", lang) ?? "0", href: null },
                  { label: t.profile.openDeals, value: String(n("open_deals")), href: canOpenWork ? dealsHref() : null },
                  { label: t.profile.resultViewings, value: String(n("viewings")), href: null },
                  { label: t.profile.resultCalls, value: String(n("calls")), href: null },
                  { label: t.profile.resultMeetings, value: String(n("meetings")), href: null },
                  {
                    label: t.profile.resultClients,
                    value: String(n("new_clients")),
                    href: canOpenWork ? (isSelf ? "/clients" : `/clients?broker=${id}`) : null,
                  },
                ].map((tile) => {
                  const body = (
                    <>
                      <dt className="text-xs font-medium text-muted">{tile.label}</dt>
                      <dd className="mt-1 truncate text-xl font-bold tracking-tight">{tile.value}</dd>
                    </>
                  );
                  return tile.href ? (
                    <Link
                      key={tile.label}
                      href={tile.href}
                      className="rounded-xl bg-raised px-4 py-3 ring-1 ring-transparent transition hover:ring-accent/50"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={tile.label} className="rounded-xl bg-raised px-4 py-3">
                      {body}
                    </div>
                  );
                })}
              </dl>
            </Card>
          )}

          <Card title={t.profile.about}>
            {profile.bio ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{profile.bio}</p>
            ) : (
              <p className="text-sm text-muted">{t.profile.noBio}</p>
            )}

            <h3 className="mt-6 text-sm font-semibold text-fg">{t.profile.areas}</h3>
            {profile.areas && profile.areas.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.areas.map((area: string) => (
                  <li
                    key={area}
                    className="inline-flex items-center gap-1 rounded-full bg-raised px-3 py-1 text-sm text-fg-2"
                  >
                    <MapPin className="size-3.5 text-accent-fg" />
                    {area}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{t.profile.noAreas}</p>
            )}
          </Card>

          <Card
            title={
              <span className="flex items-center justify-between gap-3">
                {t.profile.properties}
                {properties.length > 0 && (
                  <Link
                    href={`/properties?broker=${id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                  >
                    {t.profile.viewAll}
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </span>
            }
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  [t.list.statTotal, counts.total, propertiesHref()],
                  [t.list.statActive, counts.active, propertiesHref("active")],
                  [t.list.statReserved, counts.reserved, propertiesHref("reserved")],
                  [t.list.statClosed, counts.closed, propertiesHref("sold")],
                ] as const
              ).map(([label, value, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-xl bg-raised px-4 py-3 ring-1 ring-transparent transition hover:ring-accent/50"
                >
                  <dt className="text-xs font-medium text-muted">{label}</dt>
                  <dd className="mt-1 text-2xl font-bold tracking-tight">{value}</dd>
                </Link>
              ))}
            </dl>

            <h3 className="mt-6 text-sm font-semibold text-fg">{t.profile.recentProperties}</h3>
            {properties.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t.profile.noProperties}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-soft">
                {properties.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/properties/${p.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-raised"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.title}</p>
                        {p.settlement && (
                          <p className="truncate text-sm text-muted">{settlementLabel(p.settlement)}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-semibold">
                        {formatPrice(p.current_price === null ? null : Number(p.current_price), p.currency, lang) ??
                          t.common.notSet}
                      </p>
                      <StatusBadge
                        status={p.status}
                        label={t.options.status[p.status as keyof typeof t.options.status] ?? p.status}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
