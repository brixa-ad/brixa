import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DealForm } from "@/components/deal/DealForm";
import { getDeal, getDealFormLookups } from "@/lib/deals";
import { getI18n } from "@/lib/i18n/server";
import { CURRENCIES, isOneOf } from "@/lib/options";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.deals.editDeal };
}

export default async function EditDealPage({ params }: PageProps<"/deals/[id]/edit">) {
  const { id } = await params;
  const session = (await getSession())!;
  const [{ t }, deal, lookups] = await Promise.all([getI18n(), getDeal(id), getDealFormLookups(session.organizationId)]);
  if (!deal) notFound();

  // Brokers run their own deals until a manager has confirmed them.
  const canEdit = session.isManager || (deal.broker_id === session.userId && !deal.confirmed_at);
  if (!canEdit) redirect(`/deals/${id}`);

  return (
    <>
      <PageHeader backHref={`/deals/${id}`} backLabel={t.deals.title} title={t.deals.editDeal} />
      <DealForm
        dealId={id}
        lookups={lookups}
        canAssign={session.isManager}
        initial={{
          kind: deal.kind,
          propertyId: deal.property_id,
          clientId: deal.client_id,
          brokerId: deal.broker_id ?? session.userId,
          stage: deal.stage,
          price: deal.price === null ? "" : String(deal.price),
          currency: isOneOf(CURRENCIES, deal.currency) ? deal.currency : "EUR",
          commission: deal.commission === null ? "" : String(deal.commission),
          notes: deal.notes ?? "",
        }}
      />
    </>
  );
}
