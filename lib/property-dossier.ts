import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET } from "./documents";
import { docsFor, isSaleCase, type SaleCase, type SaleDoc, type SaleOffice } from "./sale-docs";

export type DocStatus = "have" | "need" | "ordered" | "na";

export type DossierFile = {
  id: string;
  name: string;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
  uploader: string | null;
  doc_code: string | null;
};

type Person = { full_name: string | null; email: string } | null;
const personName = (p: Person) => (p ? p.full_name || p.email : null);

/** A property's documents: the cases, the history, each document's status and the files — and the offices in its town. */
export async function getPropertyDossier(supabase: SupabaseClient, propertyId: string, town: string | null) {
  const [{ data: dossier }, { data: statusRows }, { data: fileRows }, { data: docRows }, { data: officeRows }] = await Promise.all([
    supabase.from("property_dossiers").select("cases, history, updated_at").eq("property_id", propertyId).maybeSingle(),
    supabase.from("property_doc_status").select("doc_code, status").eq("property_id", propertyId),
    supabase
      .from("property_documents")
      .select("id, name, size_bytes, storage_path, created_at, doc_code, uploader:profiles(full_name, email)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false }),
    supabase.from("sale_docs").select("*").order("sort"),
    town ? supabase.from("sale_offices").select("*").eq("city", town) : Promise.resolve({ data: [] }),
  ]);
  const cases = ((dossier?.cases ?? []) as string[]).filter(isSaleCase) as SaleCase[];
  const statuses = new Map(((statusRows ?? []) as { doc_code: string; status: DocStatus }[]).map((s) => [s.doc_code, s.status]));
  const files: DossierFile[] = await Promise.all(
    ((fileRows ?? []) as unknown as {
      id: string;
      name: string;
      size_bytes: number | null;
      storage_path: string;
      created_at: string;
      doc_code: string | null;
      uploader: Person;
    }[]).map(async (f) => {
      const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(f.storage_path, 3600, { download: f.name });
      return {
        id: f.id,
        name: f.name,
        size_bytes: f.size_bytes === null ? null : Number(f.size_bytes),
        created_at: f.created_at,
        url: data?.signedUrl ?? null,
        uploader: personName(f.uploader),
        doc_code: f.doc_code,
      };
    })
  );
  const docs = (docRows ?? []) as SaleDoc[];
  const checklist = docsFor(docs, cases).map((doc) => ({
    doc,
    status: statuses.get(doc.code) ?? null,
    files: files.filter((f) => f.doc_code === doc.code),
  }));
  return {
    cases,
    history: (dossier?.history as string | null) ?? "",
    checklist,
    otherFiles: files.filter((f) => !f.doc_code || !checklist.some((c) => c.doc.code === f.doc_code)),
    offices: (officeRows ?? []) as SaleOffice[],
  };
}

export type PropertyDossier = Awaited<ReturnType<typeof getPropertyDossier>>;

/** How far a checklist is: the documents that count (not "doesn't apply"), the ones we have, to obtain, ordered. */
export function dossierProgress(checklist: { status: DocStatus | null }[]) {
  const counted = checklist.filter((c) => c.status !== "na");
  return {
    total: counted.length,
    have: counted.filter((c) => c.status === "have").length,
    need: counted.filter((c) => c.status === "need").length,
    ordered: counted.filter((c) => c.status === "ordered").length,
  };
}
