import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building, History, Mail, Phone, Search } from "lucide-react";
import { ContactButtons } from "@/components/ContactButtons";
import { PageHeader } from "@/components/PageHeader";
import { ColleagueLog } from "@/components/partners/ColleagueLog";
import { PartnerForm } from "@/components/partners/PartnerForm";
import { ShareList, type ShareRow } from "@/components/property/ShareList";
import { TaskItem } from "@/components/task/TaskItem";
import { TypeIcon } from "@/components/task/TypeIcon";
import { Card } from "@/components/ui/form";
import { addDays, sofiaToday } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT, byDue, personName, type TaskRow } from "@/lib/tasks";

export async function generateMetadata({ params }: PageProps<"/partners/[id]">): Promise<Metadata> {
  const supabase = await createClient();
  const { data } = await supabase.from("partners").select("full_name").eq("id", (await params).id).maybeSingle();
  return { title: data?.full_name ?? "BRIXA" };
}

/** A colleague's card: how to reach them, what we talked about, what we sent them, what they look for. */
export default async function PartnerPage({ params }: PageProps<"/partners/[id]">) {
  const { id } = await params;
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, { data: partner }, { data: actRows }, { data: shareRows }, { data: searchRows }, { data: taskRows }] = await Promise.all([
    getI18n(),
    supabase.from("partners").select("id, full_name, phone, email, agency, notes").eq("id", id).maybeSingle(),
    supabase
      .from("activities")
      .select("id, type, note, occurred_at, person:profiles(full_name, email), property:properties(id, title)")
      .eq("partner_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("property_shares")
      .select("id, token, views, last_viewed_at, revoked_at, created_at, created_by, property:properties(id, title), creator:profiles(full_name, email)")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("partner_searches").select("id, operation, budget_max, currency, note, active, created_at").eq("partner_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select(TASK_SELECT).eq("partner_id", id).eq("status", "open"),
  ]);
  if (!partner) notFound();
  const today = sofiaToday();

  const activities = (actRows ?? []) as unknown as {
    id: string;
    type: string;
    note: string | null;
    occurred_at: string;
    person: { full_name: string | null; email: string } | null;
    property: { id: string; title: string } | null;
  }[];
  const sent: ShareRow[] = (
    (shareRows ?? []) as unknown as {
      id: string;
      token: string;
      views: number;
      last_viewed_at: string | null;
      revoked_at: string | null;
      created_at: string;
      created_by: string | null;
      property: { id: string; title: string } | null;
      creator: { full_name: string | null; email: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    token: row.token,
    name: row.property?.title ?? null,
    href: row.property ? `/properties/${row.property.id}` : null,
    sharedBy: row.creator && row.created_by !== session.userId ? personName(row.creator) : null,
    views: row.views,
    lastViewedAt: row.last_viewed_at,
    revoked: row.revoked_at !== null,
    createdAt: row.created_at,
  }));
  const tasks = ((taskRows ?? []) as unknown as TaskRow[]).sort(byDue);

  return (
    <>
      <PageHeader
        backHref="/partners"
        backLabel={t.partners.title}
        title={partner.full_name}
        subtitle={partner.agency ?? undefined}
        actions={<PartnerForm partner={{ ...partner, phone: partner.phone ?? "", email: partner.email ?? "", agency: partner.agency ?? "", notes: partner.notes ?? "" }} />}
      />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-2 text-sm">
              {partner.phone && (
                <p className="flex items-center gap-3">
                  <Phone className="size-4 text-accent-fg" />
                  <span className="font-medium">{partner.phone}</span>
                </p>
              )}
              {partner.email && (
                <p className="flex items-center gap-3">
                  <Mail className="size-4 text-accent-fg" />
                  <span className="truncate">{partner.email}</span>
                </p>
              )}
              {partner.agency && (
                <p className="flex items-center gap-3">
                  <Building className="size-4 text-accent-fg" />
                  {partner.agency}
                </p>
              )}
            </div>
            {(partner.phone || partner.email) && (
              <div className="mt-4">
                <ContactButtons phone={partner.phone} email={partner.email} />
              </div>
            )}
            {partner.notes && <p className="mt-4 whitespace-pre-line border-t border-line-soft pt-4 text-sm text-fg-2">{partner.notes}</p>}
          </Card>

          <Card title={t.partners.tasksTitle}>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted">{t.partners.noTasks}</p>
            ) : (
              <ul className="-mx-3">
                {tasks.map((task) => (
                  <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Search className="size-4 text-brand-cyan" />
                {t.partners.theirSearches}
              </span>
            }
          >
            {(searchRows ?? []).length === 0 ? (
              <p className="text-sm text-muted">{t.partners.noSearches}</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {(searchRows ?? []).map((s) => (
                  <li key={s.id}>
                    <Link href={`/partner-searches/${s.id}`} className="block rounded-lg px-2 py-2 text-sm transition hover:bg-raised">
                      <span className={`font-medium ${s.active ? "" : "text-muted line-through"}`}>
                        {t.options.operation[s.operation as keyof typeof t.options.operation] ?? s.operation}
                        {s.budget_max ? ` · ${formatPrice(Number(s.budget_max), s.currency, lang)}` : ""}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDate(s.created_at, lang)}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t.partners.logTitle}>
            <ColleagueLog partners={[]} fixedPartner={partner.id} tomorrow={addDays(today, 1)} />
          </Card>

          <Card title={t.partners.sentListings}>
            <ShareList rows={sent} empty={t.partners.noSent} />
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <History className="size-4 text-brand-cyan" />
                {t.partners.history}
              </span>
            }
          >
            {activities.length === 0 ? (
              <p className="text-sm text-muted">{t.partners.noHistory}</p>
            ) : (
              <ol className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                      <TypeIcon type={a.type} className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{t.options.activityType[a.type as keyof typeof t.options.activityType] ?? a.type}</span>
                        {a.property && (
                          <>
                            {" · "}
                            <Link href={`/properties/${a.property.id}`} className="text-accent-fg hover:underline">
                              {a.property.title}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-subtle">
                        {formatDate(a.occurred_at, lang, true)}
                        {a.person ? ` · ${personName(a.person)}` : ""}
                      </p>
                      {a.note && <p className="mt-0.5 whitespace-pre-line text-sm text-fg-2">{a.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
