"use server";

import { revalidatePath } from "next/cache";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

/** Remove a document (the row and the file). Only the responsible broker and managers can. */
export async function deletePropertyDocument(documentId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_documents")
    .delete()
    .eq("id", documentId)
    .select("property_id, storage_path")
    .maybeSingle();
  if (error || !data) {
    console.error("Deleting a document failed:", error?.message ?? "no row");
    return { ok: false };
  }
  await supabase.storage.from(DOCUMENT_BUCKET).remove([data.storage_path]);
  revalidatePath(`/properties/${data.property_id}`);
  return { ok: true };
}

/** After the browser has uploaded the file: refresh the property page. */
export async function documentsChanged(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
}
