import { Eye, Flame, Snowflake } from "lucide-react";
import { LinkActivityItem, TemperatureItem } from "@/components/signals/SignalRows";
import { Card } from "@/components/ui/form";
import type { Dictionary, Lang } from "@/lib/i18n/dictionaries";
import { getLinkActivity, getTemperatures } from "@/lib/signals-server";
import { createClient } from "@/lib/supabase/server";

/** How the clients behave: who is ready to close, who opens the links, who is cooling down (Follow-up → Signals). */
export async function SignalsBoard({
  organizationId,
  broker,
  viewerId,
  t,
  lang,
}: {
  organizationId: string;
  /** one broker's clients, or everyone's (null) */
  broker: string | null;
  viewerId: string;
  t: Dictionary;
  lang: Lang;
}) {
  const supabase = await createClient();
  const [hot, opens, cooling] = await Promise.all([
    getTemperatures(supabase, organizationId, { broker, temperatures: ["hot"], limit: 50 }),
    getLinkActivity(supabase, organizationId, { broker }),
    getTemperatures(supabase, organizationId, { broker, temperatures: ["cooling", "cold"], limit: 60 }),
  ]);
  const showBroker = broker !== viewerId;

  const title = (Icon: typeof Flame, text: string, count: number, tone: string) => (
    <span className="flex items-center gap-2">
      <Icon className={`size-4 ${tone}`} />
      {text}
      {count > 0 && <span className="text-sm font-normal text-muted">· {count}</span>}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* ---- 🔥 ready to close ---- */}
      <Card title={title(Flame, t.signals.hotTitle, hot.length, "text-danger")} description={t.signals.hotHint}>
        {hot.length === 0 ? (
          <p className="text-sm text-muted">{t.signals.hotNone}</p>
        ) : (
          <ul className="-my-3 grid grid-cols-1 divide-y divide-line-soft lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
            {hot.map((row) => (
              <TemperatureItem key={row.client.id} row={row} t={t} lang={lang} showBroker={showBroker} />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
  );
}
