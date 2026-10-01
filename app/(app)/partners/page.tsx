import type { Metadata } from "next";
import Link from "next/link";
import { Building, Contact, Phone } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PartnerForm } from "@/components/partners/PartnerForm";
import { PartnerSearch } from "@/components/partners/PartnerSearch";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { ago } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.partners.title };
}

/** Colleagues from other agencies — the agency's directory, the last contact first. */
export default async function PartnersPage({ searchParams }: PageProps<"/partners">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.replace(/[,()%_\\]/g, " ").trim() : "";
  const session = (await getSession())!;
  const supabase = await createClient();

  let query = supabase
    .from("partners")
    .select("id, full_name, phone, agency, created_at")
    .eq("organization_id", session.organizationId)
    .order("full_name")
    .limit(500);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`full_name.ilike.%${q}%`, `agency.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone_normalized.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  const [{ t, lang }, { data: rows }] = await Promise.all([getI18n(), query]);
  const partners = rows ?? [];
  const ids = partners.map((p) => p.id);

  // the last contact (mine; managers: anyone's), how many listings sent, how many searches
  const [{ data: acts }, { data: shares }, { data: searches }] =
    ids.length > 0
      ? await Promise.all([
          supabase.from("activities").select("partner_id, occurred_at").in("partner_id", ids).order("occurred_at", { ascending: false }).limit(2000),
          supabase.from("property_shares").select("partner_id").in("partner_id", ids).limit(5000),
          supabase.from("partner_searches").select("partner_id").in("partner_id", ids).limit(5000),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const last = new Map<string, string>();
  for (const a of acts ?? []) if (a.partner_id && !last.has(a.partner_id)) last.set(a.partner_id, a.occurred_at);
  const count = (list: { partner_id: string | null }[] | null) => {
    const map = new Map<string, number>();
    for (const row of list ?? []) if (row.partner_id) map.set(row.partner_id, (map.get(row.partner_id) ?? 0) + 1);
    return map;
  };
  const sent = count(shares);
  const sought = count(searches);
  const sorted = [...partners].sort((a, b) => (last.get(b.id) ?? "").localeCompare(last.get(a.id) ?? "") || a.full_name.localeCompare(b.full_name, "bg"));

  return (
    <>
      <PageHeader title={t.partners.title} subtitle={t.partners.subtitle} actions={<PartnerForm />} />
      <PartnerSearch />
      {sorted.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <Contact className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{q ? t.partners.noResults : t.partners.empty}</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {sorted.map((p) => (
            <li key={p.id}>
              <Link href={`/partners/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition hover:bg-raised sm:px-5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{p.full_name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    {p.agency && (
                      <span className="inline-flex items-center gap-1">
                        <Building className="size-3.5" />
                        {p.agency}
                      </span>
                    )}
                    {p.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" />
                        {p.phone}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-xs text-subtle">
                  {[
                    last.has(p.id) ? fmt(t.partners.lastContact, { when: ago(last.get(p.id)!, lang) }) : t.partners.never,
                    sent.get(p.id) ? fmt(t.partners.sharedCount, { n: sent.get(p.id)! }) : null,
                    sought.get(p.id) ? fmt(t.partners.searchesCount, { n: sought.get(p.id)! }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
