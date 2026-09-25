import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { PropertyForm } from "@/components/property/PropertyForm";
import { emptyFormValues } from "@/lib/property-form";
import { getI18n } from "@/lib/i18n/server";
import { getFormLookups } from "@/lib/lookups";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.form.newTitle };
}

export default async function NewPropertyPage() {
  const session = (await getSession())!;
  const [{ t }, lookups] = await Promise.all([getI18n(), getFormLookups(session.organizationId)]);

  return (
    <>
      <PageHeader
        backHref="/properties"
        backLabel={t.nav.properties}
        title={t.form.newTitle}
        subtitle={t.form.newSubtitle}
      />
      <PropertyForm
        mode="create"
        lookups={lookups}
        initialValues={emptyFormValues(session.userId)}
        organizationId={session.organizationId}
        userId={session.userId}
        canAssignBroker={session.isManager}
      />
    </>
  );
}
