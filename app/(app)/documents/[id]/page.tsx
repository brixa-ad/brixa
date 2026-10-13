import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChecklistRow, type Where } from "@/components/dossier/ChecklistRow";
import { DossierForm } from "@/components/dossier/DossierForm";
import { PageHeader } from "@/components/PageHeader";
import { PropertyDocuments } from "@/components/property/PropertyDocuments";
import { Card } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { dossierProgress, getPropertyDossier } from "@/lib/property-dossier";
import { isOfficeKind } from "@/lib/sale-docs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dossier.title };
}

/** A property's documents: its history, the checklist (have / to obtain / ordered — with where, the fee, the time), the files. */
export default async function PropertyDossierPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t }, { data: property }] = await Promise.all([
    getI18n(),
    supabase
      .from("properties")
      .select("id, title, organization_id, responsible_broker_id, settlement:geo_settlements(name, settlement_type)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!property || (!session.isManager && property.responsible_broker_id !== session.userId)) notFound();
  const settlement = property.settlement as unknown as { name: string; settlement_type: string } | null;
  const town = settlement?.settlement_type === "гр." ? settlement.name : null;
  const dossier = await getPropertyDossier(supabase, id, town);
  const progress = dossierProgress(dossier.checklist);
  const known = dossier.offices.length > 0;

  const whereFor = (issuer: string): Where => {
    if (!isOfficeKind(issuer)) return null;
    const office = dossier.offices.find((o) => o.kind === issuer);
    if (office) return { name: office.name, address: office.address, phone: office.phone };
    return { elsewhere: t.saleDocs.elsewhere[issuer] };
  };
  const municipality = dossier.offices.find((o) => o.kind === "municipality");

  return (
    <>
      <PageHeader
        backHref={`/properties/${id}`}
        backLabel={property.title}
        title={t.dossier.title}
        subtitle={[property.title, settlement?.name].filter(Boolean).join(" · ")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card
            title={
              <span className="flex flex-wrap items-center justify-between gap-2">
                {t.dossier.checklistTitle}
                <span className="text-sm font-normal text-muted">{fmt(t.dossier.progress, { have: progress.have, total: progress.total })}</span>
              </span>
            }
            description={t.dossier.checklistHint}
          >
            <ul className="divide-y divide-line-soft">
              {dossier.checklist.map(({ doc, status, files }) => {
                const own = doc.code === "tax_valuation" ? municipality : null;
                return (
                  <ChecklistRow
                    key={doc.code}
                    propertyId={id}
                    organizationId={property.organization_id}
                    userId={session.userId}
                    doc={doc}
                    status={status}
                    files={files}
                    where={whereFor(doc.issuer)}
                    fee={own?.fee ?? doc.fee}
                    term={own?.term ?? doc.term}
                  />
                );
              })}
            </ul>
            {!known && settlement && <p className="mt-3 text-xs text-muted">{fmt(t.dossier.noOffices, { town: settlement.name })}</p>}
            <Link href={`/sale-documents${town ? `?city=${encodeURIComponent(town)}` : ""}`} className="mt-3 inline-block text-sm font-medium text-accent-fg hover:underline">
              {t.dossier.reference} →
            </Link>
          </Card>

          <Card title={t.dossier.otherFiles}>
            <PropertyDocuments propertyId={id} organizationId={property.organization_id} userId={session.userId} documents={dossier.otherFiles} />
          </Card>
        </div>

        <Card title={t.dossier.historyTitle}>
          <DossierForm propertyId={id} cases={dossier.cases} history={dossier.history} />
        </Card>
      </div>
    </>
  );
}
