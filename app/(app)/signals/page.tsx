import type { Metadata } from "next";
import { Eye, Flame, Snowflake } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LinkActivityItem, TemperatureItem } from "@/components/signals/SignalRows";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { Card } from "@/components/ui/form";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { getLinkActivity, getTemperatures } from "@/lib/signals-server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.signals.title };
}

/** How the clients behave: who is ready to close, who opens the links, who is cooling down. */
export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const params = await searchParams;
  const session = (await getSession())!;
  // managers: mine, a colleague's or everyone's; brokers: their own
  const broker = session.isManager
    ? params.broker === "all"
      ? null
      : typeof params.broker === "string" && params.broker
        ? params.broker
        : session.userId
    : session.userId;

  const supabase = await createClient();
  const [{ t, lang }, hot, opens, cooling, members] = await Promise.all([
    getI18n(),
    getTemperatures(supabase, session.organizationId, { broker, temperatures: ["hot"], limit: 50 }),
    getLinkActivity(supabase, session.organizationId, { broker }),
    getTemperatures(supabase, session.organizationId, { broker, temperatures: ["cooling", "cold"], limit: 60 }),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);
  const showBroker = broker !== session.userId;

  const title = (Icon: typeof Flame, text: string, count: number, tone: string) => (
    <span className="flex items-center gap-2">
      <Icon className={`size-4 ${tone}`} />
      {text}
      {count > 0 && <span className="text-sm font-normal text-muted">· {count}</span>}
    </span>
  );

  return (
    <>
      <PageHeader
        title={t.signals.title}
        subtitle={t.signals.subtitle}
        actions={
          session.isManager && !session.solo ? (
            <BrokerPicker
              value={broker ?? "all"}
              selfId={session.userId}
              members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
            />
          ) : undefined
        }
      />

      <div className="space-y-6">
        {/* ---- 🔥 ready to close ---- */}
        <Card title={title(Flame, t.signals.hotTitle, hot.length, "text-danger")} description={t.signals.hotHint}>
          {hot.length === 0 ? (
            <p className="text-sm text-muted">{t.signals.hotNone}</p>
          ) : (
            <ul className="-my-3 grid divide-y divide-line-soft lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
              {hot.map((row) => (
                <TemperatureItem key={row.client.id} row={row} t={t} lang={lang} showBroker={showBroker} />
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---- 👀 opening the links ---- */}
          <Card title={title(Eye, t.signals.opensTitle, opens.length, "text-brand-cyan")} description={t.signals.opensHint}>
            {opens.length === 0 ? (
              <p className="text-sm text-muted">{t.signals.opensNone}</p>
            ) : (
              <ul className="-my-3 divide-y divide-line-soft">
                {opens.map((item) => (
                  <LinkActivityItem key={item.client.id} item={item} t={t} lang={lang} showBroker={showBroker} />
                ))}
              </ul>
            )}
          </Card>

          {/* ---- 🧊 cooling down ---- */}
          <Card title={title(Snowflake, t.signals.coolingTitle, cooling.length, "text-sky-500")} description={t.signals.coolingHint}>
            {cooling.length === 0 ? (
              <p className="text-sm text-muted">{t.signals.coolingNone}</p>
            ) : (
              <ul className="-my-3 divide-y divide-line-soft">
                {cooling.map((row) => (
                  <TemperatureItem key={row.client.id} row={row} t={t} lang={lang} showBroker={showBroker} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <p className="text-xs text-subtle">{t.signals.classHint}</p>
      </div>
    </>
  );
}
