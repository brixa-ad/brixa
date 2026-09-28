import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClosedDealForm } from "@/components/closed/ClosedDealForm";
import { PageHeader } from "@/components/PageHeader";
import { CLOSED_SELECT, toClosedDeals } from "@/lib/closed-deals";
import { getClosedDealLookups } from "@/lib/closed-lookups";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import type { ClosedCondition } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.closedDeals.editTitle };
}

export default async function EditClosedDealPage({ params }: PageProps<"/closed-deals/[id]/edit">) {
  const { id } = await params;
  const session = (await getSession())!;
  if (!session.isManager) redirect("/closed-deals");
  const supabase = await createClient();
  const [{ t }, lookups, { data }] = await Promise.all([
    getI18n(),
    getClosedDealLookups(session.organizationId),
    supabase.from("closed_deals").select(CLOSED_SELECT).eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const d = toClosedDeals([data])[0];

  return (
    <>
      <PageHeader backHref="/closed-deals" backLabel={t.closedDeals.title} title={t.closedDeals.editTitle} />
      <ClosedDealForm
        id={id}
        lookups={lookups}
        today={sofiaToday()}
        initial={{
          reportedOn: d.reported_on,
          subtypeId: d.subtype_id,
          settlementId: d.settlement_id,
          neighborhoodId: d.neighborhood_id,
          street: d.street ?? "",
          streetNo: d.street_no ?? "",
          block: d.block ?? "",
          entrance: d.entrance ?? "",
          floor: d.floor ?? "",
          apartment: d.apartment ?? "",
          side: d.side,
          conditions: d.conditions as ClosedCondition[],
          construction: d.construction,
          parking: d.parking,
          area: d.area,
          price: d.price,
          parkingPrice: d.parking_price,
          brokerName: d.broker_name,
          colleagueName: d.colleague_name ?? "",
          colleagueAgency: d.colleague_agency ?? "",
          doubleSided: d.double_sided,
          propertyId: d.property_id,
          note: d.note ?? "",
        }}
      />
    </>
  );
}
