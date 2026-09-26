import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/client/ClientForm";
import { PageHeader } from "@/components/PageHeader";
import { emptySearch } from "@/lib/client-validation";
import { getClient, getClientFormLookups } from "@/lib/clients";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.clients.editTitle };
}

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  const session = (await getSession())!;
  const [{ t }, client, lookups] = await Promise.all([
    getI18n(),
    getClient(id),
    getClientFormLookups(session.organizationId),
  ]);

  // RLS only returns clients this user may edit (their own, or any for managers).
  if (!client) notFound();

  return (
    <>
      <PageHeader backHref={`/clients/${id}`} backLabel={client.full_name} title={t.clients.editTitle} />
      <ClientForm
        mode="edit"
        clientId={id}
        lookups={lookups}
        canAssignBroker={session.isManager}
        initial={{
          fullName: client.full_name,
          phone: client.phone ?? "",
          email: client.email ?? "",
          types: client.types,
          clientClass: client.client_class,
          source: client.source,
          stage: client.stage,
          notes: client.notes ?? "",
          brokerId: client.responsible_broker_id,
          search: client.search ?? emptySearch(),
        }}
      />
    </>
  );
}
