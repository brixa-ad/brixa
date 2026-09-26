import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Plus, UserRound, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ClientFilters } from "@/components/client/ClientFilters";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { CLIENT_CLASSES, CLIENT_STAGES, CLIENT_TYPES, isOneOf, type ClientStage, type ClientType } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.clients.title };
}

const LIMIT = 300;

type Row = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  types: ClientType[];
  client_class: string;
  stage: ClientStage;
  updated_at: string;
  broker: { full_name: string | null; email: string; avatar_path: string | null } | null;
};

/** Digits of a phone, with +359 / 00359 turned into a leading 0, for partial search. */
function phoneDigits(q: string) {
  const digits = q.replace(/\D/g, "");
  if (digits.startsWith("00359")) return "0" + digits.slice(5);
  if (digits.startsWith("359")) return "0" + digits.slice(3);
  return digits;
}

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.replace(/[,()%_\\]/g, " ").trim() : "";
  const stage = isOneOf(CLIENT_STAGES, params.stage) ? params.stage : "";
  const cls = isOneOf(CLIENT_CLASSES, params.class) ? params.class : "";
  const type = isOneOf(CLIENT_TYPES, params.type) ? params.type : "";
  const broker = typeof params.broker === "string" ? params.broker : "";

  const session = (await getSession())!;
  const supabase = await createClient();
  const { t, lang } = await getI18n();

  // RLS: brokers only get their own clients back; managers get everyone's.
  let query = supabase
    .from("clients")
    .select(
      `id, full_name, phone, email, types, client_class, stage, updated_at,
      broker:profiles!clients_responsible_broker_id_fkey(full_name, email, avatar_path)`
    )
    .eq("organization_id", session.organizationId)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);

  if (q) {
    const digits = phoneDigits(q);
    const parts = [`full_name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone_normalized.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  if (stage) query = query.eq("stage", stage);
  if (cls) query = query.eq("client_class", cls);
  if (type) query = query.contains("types", [type]);
  if (broker && session.isManager) query = query.eq("responsible_broker_id", broker);

  const [{ data, error }, { data: all }, members] = await Promise.all([
    query,
    supabase.from("clients").select("client_class, stage").eq("organization_id", session.organizationId),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);
  if (error) console.error("Loading clients failed:", error.message);

  const rows = (data ?? []) as unknown as Row[];
  const counts = { total: 0, hot: 0, active: 0, deals: 0 };
  for (const c of all ?? []) {
    counts.total++;
    if (c.client_class === "A") counts.hot++;
    if (c.stage === "negotiation" || c.stage === "deposit") counts.active++;
    if (c.stage === "deal") counts.deals++;
  }
  const filtered = Boolean(q || stage || cls || type || broker);

  return (
    <>
      <PageHeader
        title={t.clients.title}
        subtitle={session.isManager ? t.clients.subtitleManager : t.clients.subtitleBroker}
        actions={
          <Link href="/clients/new" className={buttonClass.primary}>
            <Plus className="size-4" />
            {t.clients.newClient}
          </Link>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t.clients.statTotal, counts.total],
          [t.clients.statHot, counts.hot],
          [t.clients.statActive, counts.active],
          [t.clients.statDeals, counts.deals],
        ].map(([name, value]) => (
          <div key={name} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs">
            <dt className="text-xs font-medium text-muted">{name}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <ClientFilters brokers={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))} />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <Users className="mx-auto size-10 text-faint" />
          {filtered ? (
            <p className="mt-3 text-sm text-muted">{t.clients.noResults}</p>
          ) : (
            <>
              <p className="mt-3 font-semibold">{t.clients.emptyTitle}</p>
              <p className="mt-1 text-sm text-muted">{t.clients.emptyHint}</p>
              <Link href="/clients/new" className={`${buttonClass.primary} mt-5`}>
                <Plus className="size-4" />
                {t.clients.newClient}
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clients/${c.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-raised sm:flex-nowrap sm:px-5"
              >
                <ClassBadge value={c.client_class} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{c.full_name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {c.types.map((tp) => (
                      <span key={tp} className="rounded-md bg-raised px-1.5 py-0.5 text-xs text-fg-2">
                        {t.options.clientType[tp]}
                      </span>
                    ))}
                  </p>
                </div>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-fg">
                  {t.options.stage[c.stage]}
                </span>
                {c.phone && (
                  <span className="flex items-center gap-1.5 text-sm text-muted sm:w-40">
                    <Phone className="size-3.5" />
                    {c.phone}
                  </span>
                )}
                {session.isManager && (
                  <span className="hidden items-center gap-2 text-sm text-muted md:flex md:w-44">
                    {c.broker ? (
                      <>
                        <Avatar path={c.broker.avatar_path} name={c.broker.full_name || c.broker.email} size="sm" />
                        <span className="truncate">{c.broker.full_name || c.broker.email}</span>
                      </>
                    ) : (
                      <UserRound className="size-4" />
                    )}
                  </span>
                )}
                <span className="hidden w-24 text-right text-xs text-subtle lg:block">
                  {formatDate(c.updated_at, lang)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
