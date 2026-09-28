import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClosedDealForm } from "@/components/closed/ClosedDealForm";
import { PageHeader } from "@/components/PageHeader";
import { getClosedDealLookups } from "@/lib/closed-lookups";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.closedDeals.new };
}

export default async function NewClosedDealPage() {
  const session = (await getSession())!;
  if (!session.isManager) redirect("/closed-deals");
  const [{ t }, lookups] = await Promise.all([getI18n(), getClosedDealLookups(session.organizationId)]);
  const today = sofiaToday();

  return (
    <>
      <PageHeader backHref="/closed-deals" backLabel={t.closedDeals.title} title={t.closedDeals.new} />
      <ClosedDealForm
        lookups={lookups}
        today={today}
        initial={{
          reportedOn: today,
          subtypeId: null,
          settlementId: null,
          neighborhoodId: null,
          street: "",
          streetNo: "",
          block: "",
          entrance: "",
          floor: "",
          apartment: "",
          side: "sale",
          conditions: [],
          construction: null,
          parking: false,
          area: null,
          price: null,
          parkingPrice: null,
          brokerName: "",
          colleagueName: "",
          colleagueAgency: "",
          doubleSided: false,
          propertyId: null,
          note: "",
        }}
      />
    </>
  );
}
