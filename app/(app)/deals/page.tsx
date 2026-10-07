import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, Plus } from "lucide-react";
import { DealCard } from "@/components/deal/DealCard";
import { PageHeader } from "@/components/PageHeader";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { buttonClass } from "@/components/ui/form";
import { DEAL_SELECT, toDeals, type DealRow } from "@/lib/deals";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMyPeople } from "@/lib/lookups";
import { DEAL_STAGES } from "@/lib/options";
import { memberBack } from "@/lib/member-back";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.deals.title };
}

const TABS = ["open", "confirm", "won", "lost"] as const;
type Tab = (typeof TABS)[number];

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();
  const { t, lang } = await getI18n();

  const tabs = TABS.filter((tab) => tab !== "confirm" || session.isManager);
  const tab: Tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "open";

  // Managers see everyone's (or one colleague's); brokers see their own.
  const broker = session.isManager
    ? typeof params.broker === "string"
      ? params.broker
      : "all"
    : session.userId;
  const showBroker = broker === "all";
  const back = session.isManager ? await memberBack(broker, session.organizationId) : null;

  let query = supabase.from("deals").select(DEAL_SELECT).eq("organization_id", session.organizationId);
  if (broker !== "all") query = query.eq("broker_id", broker);
  if (tab === "open") query = query.eq("status", "open").order("updated_at", { ascending: false });
  if (tab === "confirm") query = query.eq("status", "won").is("confirmed_at", null).order("closed_on", { ascending: false });
  if (tab === "won") query = query.eq("status", "won").order("closed_on", { ascending: false }).limit(200);
  if (tab === "lost") query = query.eq("status", "lost").order("updated_at", { ascending: false }).limit(200);

  const [{ data, error }, members, { count: toConfirm }] = await Promise.all([
    query,
    session.isManager ? getMyPeople(supabase) : Promise.resolve([]),
    session.isManager
      ? supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", session.organizationId)
          .eq("status", "won")
          .is("confirmed_at", null)
      : Promise.resolve({ count: 0 }),
  ]);
  if (error) console.error("Loading deals failed:", error.message);
  const deals = toDeals(data);

  const tabLabel: Record<Tab, string> = {
    open: t.deals.tabOpen,
    confirm: t.deals.tabConfirm,
    won: t.deals.tabWon,
    lost: t.deals.tabLost,
  };
  const tabHref = (next: Tab) => {
    const qs = new URLSearchParams();
    if (next !== "open") qs.set("tab", next);
    if (session.isManager && broker !== "all") qs.set("broker", broker);
    const s = qs.toString();
    return s ? `/deals?${s}` : "/deals";
  };

  const pipeline = tab === "open" ? deals.reduce((sum, d) => sum + (d.net_commission ?? d.commission ?? 0), 0) : 0;
  const byStage = new Map<string, DealRow[]>(DEAL_STAGES.map((stage) => [stage, []]));
  for (const deal of deals) byStage.get(deal.stage)?.push(deal);

  return (
    <>
      <PageHeader
        backHref={back?.href}
        backLabel={back?.label}
        title={t.deals.title}
        subtitle={session.isManager ? t.deals.subtitleManager : t.deals.subtitle}
        actions={
          <>
            {session.isManager && (
              <BrokerPicker
                value={broker}
                selfId={session.userId}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
                allByDefault
              />
            )}
            <Link href="/deals/new" className={buttonClass.primary}>
              <Plus className="size-4" />
              {t.deals.newDeal}
            </Link>
          </>
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {tabLabel[key]}
            {key === "confirm" && (toConfirm ?? 0) > 0 && (
              <span className="rounded-full bg-warning px-1.5 text-[11px] font-bold text-canvas">{toConfirm}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "open" && deals.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          {fmt(t.deals.pipeline, { amount: formatPrice(pipeline, "EUR", lang) ?? "0" })}
        </p>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <Handshake className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{t.deals.empty}</p>
        </div>
      ) : tab === "open" ? (
        // One column per stage (stacked on the phone).
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {DEAL_STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            if (list.length === 0) return <div key={stage} className="hidden lg:block" />;
            return (
              <section key={stage} className="space-y-2">
                <h2 className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                  {t.options.dealStage[stage]}
                  <span className="rounded-full bg-raised px-2 py-0.5 text-[11px]">{list.length}</span>
                </h2>
                {list.map((deal) => (
                  <DealCard key={deal.id} deal={deal} t={t} lang={lang} showBroker={showBroker} from={back?.id} />
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} t={t} lang={lang} showBroker={showBroker} from={back?.id} />
          ))}
        </div>
      )}
    </>
  );
}
