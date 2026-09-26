import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { DealForm } from "@/components/deal/DealForm";
import { commissionRate, expectedCommission } from "@/lib/commission";
import { getDealFormLookups } from "@/lib/deals";
import { getI18n } from "@/lib/i18n/server";
import { CURRENCIES, isOneOf, type DealKind } from "@/lib/options";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.deals.newDeal };
}

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const [{ t }, lookups] = await Promise.all([getI18n(), getDealFormLookups(session.organizationId)]);

  // Opened from a property or client page → pre-link it.
  const property = lookups.properties.find((p) => p.id === params.property);
  const client = lookups.clients.find((c) => c.id === params.client);
  const kind: DealKind = property?.operation_type === "rent" ? "rent" : "sale";
  const currency = property && isOneOf(CURRENCIES, property.currency) ? property.currency : "EUR";
  const commission = property
    ? expectedCommission(
        kind,
        property.current_price,
        currency,
        commissionRate(kind, property.commission_rate, lookups.defaults)
      )
    : null;

  return (
    <>
      <PageHeader backHref="/deals" backLabel={t.deals.title} title={t.deals.newDeal} />
      <DealForm
        lookups={lookups}
        canAssign={session.isManager}
        initial={{
          kind,
          propertyId: property?.id ?? null,
          clientId: client?.id ?? null,
          brokerId: session.userId,
          stage: "viewing",
          price: property?.current_price != null ? String(property.current_price) : "",
          currency,
          commission: commission === null ? "" : String(commission),
          notes: "",
        }}
      />
    </>
  );
}
