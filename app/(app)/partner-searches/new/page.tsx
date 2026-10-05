import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { PartnerSearchForm } from "@/components/partner/PartnerSearchForm";
import { emptySearch } from "@/lib/client-validation";
import { getClientFormLookups } from "@/lib/clients";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.partnerSearches.new };
}

export default async function NewPartnerSearchPage() {
  const [{ t }, lookups] = await Promise.all([getI18n(), getClientFormLookups()]);
  return (
    <>
      <PageHeader backHref="/partner-searches" backLabel={t.partnerSearches.title} title={t.partnerSearches.new} />
      <PartnerSearchForm
        lookups={lookups}
        initial={{ brokerName: "", agency: "", phone: "", email: "", note: "", search: emptySearch() }}
      />
    </>
  );
}
