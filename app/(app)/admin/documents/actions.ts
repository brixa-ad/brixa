"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const clean = (value: unknown, max: number) => {
  const s = typeof value === "string" ? value.trim().slice(0, max) : "";
  return s || null;
};

/** BRIXA's owner keeps a document's fee, time, validity and notes up to date. */
export async function saveSaleDoc(code: string, input: { about: string; fee: string; term: string; validity: string; online: string }) {
  const session = await getSession();
  if (!session?.platformAdmin) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sale_docs")
    .update({
      about: clean(input.about, 1000),
      fee: clean(input.fee, 300),
      term: clean(input.term, 300),
      validity: clean(input.validity, 500),
      online: clean(input.online, 300),
    })
    .eq("code", code);
  if (error) console.error("Saving a sale document failed:", error.message);
  revalidatePath("/sale-documents");
  revalidatePath("/admin/documents");
  return { ok: !error };
}

/** …and an office's address, phone, and (the municipality's) fee and time. */
export async function saveSaleOffice(id: string, input: { name: string; address: string; phone: string; fee: string; term: string }) {
  const session = await getSession();
  if (!session?.platformAdmin) return { ok: false };
  const name = clean(input.name, 200);
  if (!name) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sale_offices")
    .update({
      name,
      address: clean(input.address, 300),
      phone: clean(input.phone, 100),
      fee: clean(input.fee, 300),
      term: clean(input.term, 300),
    })
    .eq("id", id);
  if (error) console.error("Saving a sale office failed:", error.message);
  revalidatePath("/sale-documents");
  revalidatePath("/admin/documents");
  return { ok: !error };
}
