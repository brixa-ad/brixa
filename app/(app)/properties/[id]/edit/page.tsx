import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PhotoManager } from "@/components/property/PhotoManager";
import { PropertyForm } from "@/components/property/PropertyForm";
import { getI18n } from "@/lib/i18n/server";
import { getFormLookups } from "@/lib/lookups";
import { CURRENCIES, OPERATION_TYPES, isOneOf } from "@/lib/options";
import { getProperty, type PropertyDetail } from "@/lib/properties";
import type { PropertyFormValues } from "@/lib/property-form";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.form.editTitle };
}

const str = (value: number | string | null) => (value === null ? "" : String(value));

function toFormValues(property: PropertyDetail): PropertyFormValues {
  return {
    categoryId: property.category_id,
    subtypeId: property.subtype_id,
    operationType: isOneOf(OPERATION_TYPES, property.operation_type) ? property.operation_type : "sale",
    title: property.title,
    settlementId: property.settlement_id ?? "",
    neighborhoodId: property.neighborhood_id,
    address: property.address ?? "",
    area: str(property.area),
    rooms: str(property.rooms),
    bedrooms: str(property.bedrooms),
    floor: str(property.floor),
    totalFloors: str(property.total_floors),
    condition: property.condition ?? "",
    constructionType: property.construction_type ?? "",
    exposure: property.exposure ?? "",
    furnishing: property.furnishing ?? "",
    heating: property.heating ?? "",
    price: str(property.current_price),
    currency: isOneOf(CURRENCIES, property.currency) ? property.currency : "EUR",
    brokerId: property.responsible_broker_id ?? "",
    exclusiveContract: property.exclusive_contract,
    description: property.description ?? "",
    featureIds: property.features.map((feature) => feature.id),
  };
}

export default async function EditPropertyPage({ params }: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
  const session = (await getSession())!;

  const [{ t }, property, lookups] = await Promise.all([
    getI18n(),
    getProperty(id),
    getFormLookups(session.organizationId),
  ]);

  if (!property) notFound();
  if (!session.isManager && property.responsible_broker_id !== session.userId) {
    redirect(`/properties/${id}`);
  }

  return (
    <>
      <PageHeader
        backHref={`/properties/${id}`}
        backLabel={property.title}
        title={t.form.editTitle}
      />
      <div className="space-y-6">
        <PropertyForm
          mode="edit"
          propertyId={id}
          lookups={lookups}
          initialValues={toFormValues(property)}
          organizationId={session.organizationId}
          userId={session.userId}
        canAssignBroker={session.isManager}
          coverUrl={property.photos[0]?.url}
          existingPhotoCount={property.photos.length}
        />
        <div className="-mt-18 pb-24 lg:mt-0 lg:max-w-[calc(100%-344px)] lg:pb-0">
          <PhotoManager
            propertyId={id}
            organizationId={session.organizationId}
            userId={session.userId}
            photos={property.photos}
          />
        </div>
      </div>
    </>
  );
}
