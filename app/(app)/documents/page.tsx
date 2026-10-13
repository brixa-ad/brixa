import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FolderCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { dossierProgress, type DocStatus } from "@/lib/property-dossier";
import { docsFor, isSaleCase, type SaleCase, type SaleDoc } from "@/lib/sale-docs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dossier.title };
}

/** The properties' documents: for each listing, how far its checklist is — and the way into it. */
export default async function DocumentsPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  let query = supabase
    .from("properties")
    .select("id, title, status, settlement:geo_settlements(name, settlement_type)")
    .eq("organization_id", session.organizationId)
    .in("status", ["active", "reserved"])
    .order("updated_at", { ascending: false })
    .limit(300);
  // a broker: their own listings (the managers see their people's too)
  if (!session.isManager) query = query.eq("responsible_broker_id", session.userId);
  const [{ t }, { data: propertyRows }, { data: docRows }] = await Promise.all([
    getI18n(),
    query,
    supabase.from("sale_docs").select("*").order("sort"),
  ]);
  const properties = (propertyRows ?? []) as unknown as { id: string; title: string; settlement: { name: string; settlement_type: string } | null }[];
  const ids = properties.map((p) => p.id);
  const [{ data: dossierRows }, { data: statusRows }] = ids.length
    ? await Promise.all([
        supabase.from("property_dossiers").select("property_id, cases").in("property_id", ids),
        supabase.from("property_doc_status").select("property_id, doc_code, status").in("property_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const docs = (docRows ?? []) as SaleDoc[];
  const casesOf = new Map(((dossierRows ?? []) as { property_id: string; cases: string[] }[]).map((d) => [d.property_id, d.cases.filter(isSaleCase) as SaleCase[]]));
  const statusOf = new Map<string, Map<string, DocStatus>>();
  for (const s of (statusRows ?? []) as { property_id: string; doc_code: string; status: DocStatus }[]) {
    if (!statusOf.has(s.property_id)) statusOf.set(s.property_id, new Map());
    statusOf.get(s.property_id)!.set(s.doc_code, s.status);
  }

  return (
    <>
      <PageHeader title={t.dossier.title} subtitle={t.dossier.subtitle} />
      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <FolderCheck className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{t.dossier.empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {properties.map((p) => {
            const statuses = statusOf.get(p.id) ?? new Map<string, DocStatus>();
            const list = docsFor(docs, casesOf.get(p.id) ?? []).map((doc) => ({ status: statuses.get(doc.code) ?? null }));
            const progress = dossierProgress(list);
            const done = progress.total > 0 && progress.have === progress.total;
            return (
              <li key={p.id}>
                <Link href={`/documents/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      {p.settlement && <span>{p.settlement.name}</span>}
                      <span className={done ? "font-semibold text-success" : ""}>{fmt(t.dossier.progress, { have: progress.have, total: progress.total })}</span>
                      {progress.need > 0 && <span className="font-semibold text-warning">{fmt(t.dossier.needCount, { n: progress.need })}</span>}
                      {progress.ordered > 0 && <span className="text-accent-fg">{fmt(t.dossier.orderedCount, { n: progress.ordered })}</span>}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
