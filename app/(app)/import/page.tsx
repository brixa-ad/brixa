import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./ImportWizard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.importer.title };
}

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, members, { data: org }, { data: subtypes }] = await Promise.all([
    getI18n(),
    getMembers(supabase, session.organizationId),
    supabase.from("organizations").select("city").eq("id", session.organizationId).maybeSingle(),
    supabase.from("property_subtypes").select("code, name, name_en").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader title={t.importer.title} subtitle={t.importer.subtitle} />
      <ImportWizard
        initialKind={params.what === "properties" ? "properties" : "clients"}
        members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email, email: m.email }))}
        defaultTown={(org?.city as string | null) ?? ""}
        subtypes={(subtypes ?? []).map((s) => ({ code: s.code as string, name: localName(s as { name: string; name_en: string | null }, lang) }))}
      />
    </>
  );
}
