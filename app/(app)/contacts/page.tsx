import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Phone, Plus } from "lucide-react";
import { ClassBadge } from "@/components/client/ClassBadge";
import { AssignSelect, ClaimButton } from "@/components/followup/FollowUpControls";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import type { ClientClass, ClientType } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.contacts.title };
}

type FreeContact = {
  id: string;
  full_name: string;
  phone: string | null;
  types: ClientType[];
  client_class: ClientClass;
  source: string | null;
  notes: string | null;
  updated_at: string;
};

/** Clients without a broker: anyone in the agency can take one; managers can hand them out. */
export default async function ContactsPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, { data }, members] = await Promise.all([
    getI18n(),
    supabase
      .from("clients")
      .select("id, full_name, phone, types, client_class, source, notes, updated_at")
      .eq("organization_id", session.organizationId)
      .is("responsible_broker_id", null)
      .order("updated_at", { ascending: false })
      .limit(500),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);
  const contacts = (data ?? []) as FreeContact[];

  return (
    <>
      <PageHeader
        title={t.contacts.title}
        subtitle={t.contacts.subtitle}
        actions={
          session.isManager ? (
            <Link href="/clients/new?free=1" className={buttonClass.primary}>
              <Plus className="size-4" />
              {t.contacts.newContact}
            </Link>
          ) : undefined
        }
      />

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <Inbox className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{t.contacts.empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <ClassBadge value={c.client_class} title={t.options.clientClass[c.client_class]} />
              <div className="min-w-0 flex-1">
                <Link href={`/clients/${c.id}`} className="block truncate font-semibold hover:text-accent-fg">
                  {c.full_name}
                </Link>
                <p className="truncate text-xs text-muted">
                  {[
                    c.types.map((type) => t.options.clientType[type]).join(", "),
                    c.source && t.options.source[c.source as keyof typeof t.options.source],
                    fmt(t.contacts.since, { when: formatDate(c.updated_at, lang) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {c.phone && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-2">
                    <Phone className="size-3" />
                    {c.phone}
                  </p>
                )}
                {c.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {session.isManager && (
                  <AssignSelect
                    clientId={c.id}
                    current={null}
                    label={t.contacts.assign}
                    members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
                    allowFree={false}
                  />
                )}
                <ClaimButton clientId={c.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
