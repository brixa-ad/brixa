"use server";

import { revalidatePath } from "next/cache";
import { cleanTemplate, extraKey, type MarketingPoint } from "@/lib/marketing";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

/** A point of the listing's plan was done today. */
export async function tickMarketing(propertyId: string, key: string): Promise<Result> {
  const session = await getSession();
  if (!session || !key || key.length > 60) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_done")
    .insert({ organization_id: session.organizationId, property_id: propertyId, key, done_by: session.userId });
  if (error) {
    console.error("Ticking a marketing point failed:", error.message);
    return { ok: false };
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

/** Undo the latest time a point was done. */
export async function untickMarketing(propertyId: string, doneId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("marketing_done").delete().eq("id", doneId).eq("property_id", propertyId).select("id");
  if (error || !data?.length) return { ok: false };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

/** Leave a template's point out of this listing's plan (or bring it back). */
export async function setMarketingHidden(propertyId: string, key: string, hidden: boolean): Promise<Result> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("properties").select("marketing_hidden").eq("id", propertyId).maybeSingle();
  if (!row) return { ok: false };
  const current = (row.marketing_hidden ?? []) as string[];
  const next = hidden ? [...new Set([...current, key])] : current.filter((k) => k !== key);
  const { error } = await supabase.from("properties").update({ marketing_hidden: next }).eq("id", propertyId);
  if (error) return { ok: false };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

/** A point of this listing's own (or take one away). */
export async function addMarketingPoint(propertyId: string, label: string, weekly: boolean): Promise<Result> {
  const words = label.trim();
  if (words.length < 2 || words.length > 80) return { ok: false };
  const supabase = await createClient();
  const { data: row } = await supabase.from("properties").select("marketing_extra").eq("id", propertyId).maybeSingle();
  if (!row) return { ok: false };
  const extra = cleanTemplate(row.marketing_extra);
  if (extra.length >= 20) return { ok: false };
  const point: MarketingPoint = { key: extraKey(), label: words, ...(weekly ? { weekly: true } : {}) };
  const { error } = await supabase.from("properties").update({ marketing_extra: [...extra, point] }).eq("id", propertyId);
  if (error) return { ok: false };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function removeMarketingPoint(propertyId: string, key: string): Promise<Result> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("properties").select("marketing_extra").eq("id", propertyId).maybeSingle();
  if (!row) return { ok: false };
  const extra = cleanTemplate(row.marketing_extra).filter((p) => p.key !== key);
  const { error } = await supabase.from("properties").update({ marketing_extra: extra }).eq("id", propertyId);
  if (error) return { ok: false };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

/** A manager saves the agency's template. */
export async function saveMarketingTemplate(items: MarketingPoint[]): Promise<Result> {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_marketing_template", { target_org: session.organizationId, items: cleanTemplate(items) });
  if (error) {
    console.error("Saving the marketing template failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** Brix's selling plan: the picked steps become the broker's tasks on their days. */
export async function addPlanTasks(
  propertyId: string,
  steps: { day: number; action: string; why: string; kind: string }[]
): Promise<{ ok: boolean; added: number }> {
  const session = await getSession();
  if (!session) return { ok: false, added: 0 };
  const { saveTask } = await import("../tasks/actions");
  const { addDays, sofiaToday } = await import("@/lib/dates");
  const { TASK_TYPES, isOneOf } = await import("@/lib/options");
  const today = sofiaToday();
  let added = 0;
  for (const step of steps.slice(0, 15)) {
    const day = Math.max(0, Math.min(120, Math.round(Number(step.day) || 0)));
    const result = await saveTask({
      title: String(step.action ?? "").trim().slice(0, 200) || "Маркетинг",
      type: isOneOf(TASK_TYPES, step.kind) ? step.kind : "other",
      assignedTo: session.userId,
      clientId: null,
      propertyId,
      dueDate: addDays(today, day),
      dueTime: null,
      description: String(step.why ?? "").trim().slice(0, 2000),
    });
    if (result.ok) added++;
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: added > 0, added };
}
