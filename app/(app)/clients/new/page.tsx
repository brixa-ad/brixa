import type { Metadata } from "next";
import { ClientForm } from "@/components/client/ClientForm";
import { PageHeader } from "@/components/PageHeader";
import { emptySearch } from "@/lib/client-validation";
import { getClientFormLookups } from "@/lib/clients";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.clients.newClient };
}

export default async function NewClientPage() {
  const session = (await getSession())!;
  const [{ t }, lookups] = await Promise.all([getI18n(), getClientFormLookups(session.organizationId)]);

  return (
    <>
      <PageHeader
        backHref="/clients"
        backLabel={t.clients.title}
        title={t.clients.newClient}
        subtitle={t.clients.newSubtitle}
      />
      <ClientForm
        mode="create"
        lookups={lookups}
        canAssignBroker={session.isManager}
        initial={{
          fullName: "",
          phone: "",
          email: "",
          types: ["buyer"],
          clientClass: "C",
          source: null,
          stage: "new_contact",
          notes: "",
          brokerId: session.userId,
          search: emptySearch(),
        }}
      />
    </>
  );
}
