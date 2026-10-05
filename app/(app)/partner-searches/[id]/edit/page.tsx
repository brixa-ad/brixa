import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PartnerSearchForm } from "@/components/partner/PartnerSearchForm";
import { getClientFormLookups, searchFromRow } from "@/lib/clients";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.partnerSearches.editTitle };
}

export default async function EditPartnerSearchPage({ params }: PageProps<"/partner-searches/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ t }, lookups, { data: row }] = await Promise.all([
    getI18n(),
    getClientFormLookups(),
    supabase.from("partner_searches").select("*").eq("id", id).maybeSingle(),
  ]);
  if (!row) notFound();
  const search = searchFromRow(row as Parameters<typeof searchFromRow>[0])!;

  return (
    <>
      <PageHeader backHref="/partner-searches" backLabel={t.partnerSearches.title} title={t.partnerSearches.editTitle} />
      <PartnerSearchForm
        id={id}
        lookups={lookups}
        initial={{
          brokerName: row.broker_name,
          agency: row.agency ?? "",
          phone: row.phone ?? "",
          email: row.email ?? "",
          note: row.note ?? "",
          search,
        }}
      />
    </>
  );
}
