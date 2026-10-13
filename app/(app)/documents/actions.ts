"use server";

import { revalidatePath } from "next/cache";
import { isSaleCase } from "@/lib/sale-docs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["have", "need", "ordered", "na"] as const;
export type DocStatus = (typeof STATUSES)[number];

function refresh(propertyId: string) {
  revalidatePath(`/documents/${propertyId}`);
  revalidatePath("/documents");
  revalidatePath(`/properties/${propertyId}`);
}

/** The property's history in words, and the cases that add documents (an inheritance, a mortgage…). */
export async function saveDossier(propertyId: string, input: { cases: string[]; history: string }): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("property_dossiers").upsert({
    property_id: propertyId,
    cases: [...new Set(input.cases.filter(isSaleCase))],
    history: input.history.trim().slice(0, 10000) || null,
    updated_by: session.userId,
  });
  if (error) console.error("Saving the property's history failed:", error.message);
  refresh(propertyId);
  return { ok: !error };
}

/** A document of the checklist: we have it, it must be obtained, it's ordered, it doesn't apply — or back to unmarked. */
export async function setDocStatus(propertyId: string, docCode: string, status: DocStatus | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const { error } =
    status === null
      ? await supabase.from("property_doc_status").delete().eq("property_id", propertyId).eq("doc_code", docCode)
      : (STATUSES as readonly string[]).includes(status)
        ? await supabase.from("property_doc_status").upsert({ property_id: propertyId, doc_code: docCode, status, updated_by: session.userId })
        : { error: { message: "bad status" } };
  if (error) console.error("Saving a document's status failed:", error.message);
  refresh(propertyId);
  return { ok: !error };
}
