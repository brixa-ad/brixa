import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ContactButtons } from "@/components/ContactButtons";
import { ArchiveFormButton, ConnectFormButton, NewLeadFormButton } from "@/components/leads/LeadForms";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import type { LeadAnswer } from "@/lib/leads";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { ago, one } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.leads.title };
}

type Lead = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  client_class: string;
  stage: string;
  created_at: string;
  lead_form_id: string;
  broker: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

type Form = {
  id: string;
  name: string;
  token: string;
  broker_id: string | null;
  source: string;
  connected_at: string | null;
  last_response_at: string | null;
  archived_at: string | null;
  broker: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

/** The new contacts from surveys and ads (Google Forms), a folder per form — and the folders themselves. */
export default async function ColdContactsPage({ searchParams }: PageProps<"/cold-contacts">) {
  const params = await searchParams;
  const folder = typeof params.form === "string" ? params.form : "";
  const onlyNew = params.only === "new";
  const session = (await getSession())!;
  const supabase = await createClient();

  // RLS: a broker gets their own contacts back; the folders: managers all, a broker their own
  let leadsQuery = supabase
    .from("clients")
    .select(
      `id, full_name, phone, email, client_class, stage, created_at, lead_form_id,
      broker:profiles!clients_responsible_broker_id_fkey(full_name, email)`
    )
    .eq("organization_id", session.organizationId)
    .not("lead_form_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (folder) leadsQuery = leadsQuery.eq("lead_form_id", folder);
  if (onlyNew) leadsQuery = leadsQuery.eq("stage", "new_contact");
  // every folder (for the names); the managers look after all of them, a broker after their own
  const formsQuery = supabase
    .from("lead_forms")
    .select("id, name, token, broker_id, source, connected_at, last_response_at, archived_at, broker:profiles!lead_forms_broker_id_fkey(full_name, email)")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false });

  const [{ t, lang }, { data: leadRows }, { data: formRows }, { data: allLeads }, members, requestHeaders] = await Promise.all([
    getI18n(),
    leadsQuery,
    formsQuery,
    // how many in each folder
    supabase.from("clients").select("lead_form_id").eq("organization_id", session.organizationId).not("lead_form_id", "is", null),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
    headers(),
  ]);
  const leads = (leadRows ?? []) as unknown as Lead[];
  const allForms = (formRows ?? []) as unknown as Form[];
  const forms = allForms.filter((f) => !f.archived_at && (session.isManager || f.broker_id === session.userId));
  const counts = new Map<string, number>();
  for (const row of allLeads ?? []) counts.set(row.lead_form_id, (counts.get(row.lead_form_id) ?? 0) + 1);
  const formName = new Map(allForms.map((f) => [f.id, f.name]));

  // the latest answers of each contact (a glimpse in the list)
  const answers = new Map<string, { answers: LeadAnswer[]; received_at: string }>();
  if (leads.length > 0) {
    const { data } = await supabase
      .from("lead_form_responses")
      .select("client_id, answers, received_at")
      .in("client_id", leads.slice(0, 200).map((l) => l.id))
      .order("received_at", { ascending: false });
    for (const row of data ?? []) if (row.client_id && !answers.has(row.client_id)) answers.set(row.client_id, row);
  }

  const host = requestHeaders.get("host") ?? "brixa-yavlena.vercel.app";
  const baseUrl = `${host.startsWith("localhost") ? "http" : "https"}://${host}/api/forms`;
  const href = (next: { form?: string; only?: boolean }) => {
    const qs = new URLSearchParams();
    const f = next.form ?? folder;
    const o = next.only ?? onlyNew;
    if (f) qs.set("form", f);
    if (o) qs.set("only", "new");
    const s = qs.toString();
    return s ? `/cold-contacts?${s}` : "/cold-contacts";
  };
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg-2 hover:border-line-strong"
    }`;
  // the answers that aren't the name / phone / e-mail
  const glimpse = (list: LeadAnswer[]) =>
    list
      .filter(({ q }) => !/(име|name|телефон|тел\.|phone|gsm|мобилен|имейл|мейл|e-?mail|поща)/i.test(q))
      .slice(0, 2)
      .map(({ q, a }) => `${q}: ${a}`);

  return (
    <>
      <PageHeader
        title={t.leads.title}
        subtitle={t.leads.subtitle}
        actions={
          <NewLeadFormButton
            members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
            isManager={session.isManager}
            selfId={session.userId}
            baseUrl={baseUrl}
          />
        }
      />

      {/* ---- the folders ---- */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={href({ form: "" })} className={chip(!folder)}>
          {t.leads.all}
          <span className="text-xs opacity-80">{allLeads?.length ?? 0}</span>
        </Link>
        {[...counts.keys()]
          .filter((id) => formName.has(id) || id === folder)
          .map((id) => (
            <Link key={id} href={href({ form: id })} className={chip(folder === id)}>
              <ClipboardList className="size-3.5" />
              {formName.get(id) ?? "—"}
              <span className="text-xs opacity-80">{counts.get(id)}</span>
            </Link>
          ))}
        <Link href={href({ only: !onlyNew })} className={`${chip(onlyNew)} ml-auto`}>
          {t.leads.onlyNew}
        </Link>
      </div>

      {/* ---- the contacts ---- */}
      {leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <ClipboardList className="mx-auto size-10 text-faint" />
          <p className="mt-3 font-semibold">{t.leads.empty}</p>
          <p className="mt-1 text-sm text-muted">{t.leads.emptyHint}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {leads.map((lead) => {
            const broker = one(lead.broker);
            const answered = answers.get(lead.id);
            const lines = answered ? glimpse(answered.answers) : [];
            return (
              <li key={lead.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                <ClassBadge value={lead.client_class} title={t.options.clientClass[lead.client_class as "A" | "B" | "C"]} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link href={`/clients/${lead.id}`} className="truncate font-medium hover:text-accent-fg">
                      {lead.full_name}
                    </Link>
                    {lead.stage === "new_contact" && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-fg">{t.leads.newBadge}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formName.get(lead.lead_form_id) ?? "—"} · {fmt(t.leads.answered, { when: ago(answered?.received_at ?? lead.created_at, lang) })}
                    {session.isManager && broker && ` · ${personName(broker)}`}
                  </p>
                  {lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-fg-2">
                      {lines.map((line, i) => (
                        <li key={i} className="line-clamp-2">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="shrink-0">
                  <ContactButtons phone={lead.phone} email={lead.email} clientId={lead.id} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- the folders: one Google Form each ---- */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4 text-brand-cyan" />
            {t.leads.formsTitle}
          </span>
        }
        description={t.leads.formsHint}
        className="mt-6"
      >
        {forms.length === 0 ? (
          <p className="text-sm text-muted">{t.leads.emptyHint}</p>
        ) : (
          <ul className="-my-3 divide-y divide-line-soft">
            {forms.map((form) => {
              const broker = one(form.broker);
              return (
                <li key={form.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-medium">{form.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {form.connected_at ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                          <CheckCircle2 className="size-3.5" />
                          {t.leads.connected}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-warning">
                          <Clock className="size-3.5" />
                          {t.leads.waiting}
                        </span>
                      )}
                      <span>· {broker ? personName(broker) : t.leads.noBroker}</span>
                      <span>· {fmt(t.leads.count, { n: counts.get(form.id) ?? 0 })}</span>
                      {form.last_response_at && <span>· {fmt(t.leads.lastResponse, { when: ago(form.last_response_at, lang) })}</span>}
                    </p>
                  </div>
                  <ConnectFormButton url={`${baseUrl}/${form.token}`} formName={form.name} facebook={form.source === "facebook" || form.source === "instagram"} />
                  <ArchiveFormButton id={form.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
