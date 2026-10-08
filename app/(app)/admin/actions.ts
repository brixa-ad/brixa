"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const day = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const text = (value: string | null | undefined, max: number) => {
  const clean = (value ?? "").trim().slice(0, max);
  return clean || null;
};

async function adminClient() {
  const session = await getSession();
  if (!session?.platformAdmin) return null;
  return createClient();
}

/** An agency's package, the day it has paid until, free for good, or a longer trial. */
export async function setAgency(input: {
  organizationId: string;
  plan: string | null;
  paidUntil: string | null;
  comped: boolean;
  trialUntil: string | null;
}): Promise<{ ok: boolean }> {
  const supabase = await adminClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("platform_set_agency", {
    target_org: input.organizationId,
    new_plan: input.plan ?? "",
    new_paid_until: day(input.paidUntil),
    new_comped: input.comped,
    new_trial_ends: day(input.trialUntil),
  });
  if (error) console.error("Setting an agency failed:", error.message);
  revalidatePath("/admin");
  return { ok: !error };
}

export type PlanInput = { code: string; name: string; maxPeople: number | null; price: number; position: number; active: boolean };

/** A package: changed, or a new one. */
export async function savePlan(plan: PlanInput, isNew: boolean): Promise<{ ok: boolean; error?: "code" | "generic" }> {
  const supabase = await adminClient();
  if (!supabase) return { ok: false, error: "generic" };
  const code = plan.code.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(code)) return { ok: false, error: "code" };
  const name = text(plan.name, 60);
  if (!name || !(plan.price >= 0)) return { ok: false, error: "generic" };
  const maxPeople = plan.maxPeople && plan.maxPeople > 0 ? Math.round(plan.maxPeople) : null;
  const row = { name, max_people: maxPeople, price_month: Math.round(plan.price * 100) / 100, position: plan.position, active: plan.active };
  const { error } = isNew
    ? await supabase.from("plans").insert({ code, ...row })
    : await supabase.from("plans").update(row).eq("code", code);
  if (error) console.error("Saving a package failed:", error.message);
  revalidatePath("/admin");
  return error ? { ok: false, error: error.code === "23505" ? "code" : "generic" } : { ok: true };
}

/** BRIXA's own details (the terms, the landing page, the "time to pay" screen). */
export async function saveDetails(input: {
  companyName: string;
  eik: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  trialDays: number;
}): Promise<{ ok: boolean; error?: "eik" | "generic" }> {
  const supabase = await adminClient();
  if (!supabase) return { ok: false, error: "generic" };
  const eik = input.eik.replace(/\D/g, "");
  if (eik && !/^\d{9}(\d{4})?$/.test(eik)) return { ok: false, error: "eik" };
  const website = text(input.website, 200);
  const { error } = await supabase
    .from("platform_settings")
    .update({
      company_name: text(input.companyName, 200),
      eik: eik || null,
      address: text(input.address, 300),
      email: text(input.email, 200),
      phone: text(input.phone, 40),
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      trial_days: Math.min(365, Math.max(0, Math.round(input.trialDays) || 0)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) console.error("Saving BRIXA's details failed:", error.message);
  revalidatePath("/admin");
  return error ? { ok: false, error: "generic" } : { ok: true };
}
