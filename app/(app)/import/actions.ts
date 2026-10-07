"use server";

import { revalidatePath } from "next/cache";
import type { ImportKind } from "@/lib/import";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ImportResult = {
  imported: number;
  skipped: { line: number; name?: string; phone?: string }[];
  errors: { line: number; reason: string }[];
};

/** One batch of rows (up to 300) into the agency; the database decides each row. */
export async function runImport(kind: ImportKind, rows: Record<string, unknown>[]): Promise<ImportResult | null> {
  const session = await getSession();
  if (!session || (kind !== "clients" && kind !== "properties") || !Array.isArray(rows) || rows.length === 0 || rows.length > 300) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(kind === "clients" ? "import_clients" : "import_properties", {
    target_org: session.organizationId,
    rows,
  });
  if (error || !data) {
    console.error("Import failed:", error?.message);
    return null;
  }
  revalidatePath(kind === "clients" ? "/clients" : "/properties");
  return data as ImportResult;
}
