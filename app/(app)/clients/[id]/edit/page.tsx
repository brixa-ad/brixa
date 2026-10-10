import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/client/ClientForm";
import { PageHeader } from "@/components/PageHeader";
import { emptyFinancing, emptyOffer, emptySearch } from "@/lib/client-validation";
import { getClient, getClientFormLookups } from "@/lib/clients";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

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
    getClientFormLookups(),
  ]);

  // RLS only returns clients this user may edit (their own, or any for managers).
  if (!client) notFound();
  const supabase = await createClient();
  const { data: identity } = await supabase.from("client_identity").select("egn, id_card").eq("client_id", id).maybeSingle();

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
          referrer: client.referrer ?? "",
          birthDay: client.birth_day,
          birthMonth: client.birth_month,
          egn: identity?.egn ?? "",
          idCard: identity?.id_card ?? "",
          stage: client.stage,
          notes: client.notes ?? "",
          brokerId: client.responsible_broker_id ?? "free",
          search: client.search ?? emptySearch(),
          offer: client.offer ?? emptyOffer(),
          financing: client.financing ?? emptyFinancing(),
          timeline: client.timeline,
          decider: client.decider,
          motive: client.motive ?? "",
        }}
      />
    </>
  );
}
