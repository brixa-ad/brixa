"use server";

import { revalidatePath } from "next/cache";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { normalizePhone } from "@/lib/phone";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type PartnerInput = { full_name: string; phone: string; email: string; agency: string; notes?: string };
/** An existing colleague, or a new one typed in on the spot. */
export type PartnerPick = { id: string } | { new: PartnerInput };

const clean = (value: string | undefined, max: number) => {
  const v = (value ?? "").trim().slice(0, max);
  return v || null;
};

/** The colleague picked or typed in: the one with that phone if we have them, else a new one. */
async function resolvePartner(pick: PartnerPick): Promise<{ id: string; name: string; phone: string | null; email: string | null } | null> {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  if ("id" in pick) {
    const { data } = await supabase.from("partners").select("id, full_name, phone, email").eq("id", pick.id).maybeSingle();
    return data ? { id: data.id, name: data.full_name, phone: data.phone, email: data.email } : null;
  }
  const input = pick.new;
  const name = input.full_name.trim();
  if (name.length < 2 || name.length > 120) return null;
  const phone = normalizePhone(input.phone);
  if (phone) {
    const { data: known } = await supabase
      .from("partners")
      .select("id, full_name, phone, email")
      .eq("organization_id", session.organizationId)
      .eq("phone_normalized", phone)
      .maybeSingle();
    if (known) return { id: known.id, name: known.full_name, phone: known.phone, email: known.email };
  }
  const { data, error } = await supabase
    .from("partners")
    .insert({
      organization_id: session.organizationId,
      full_name: name,
      phone: clean(input.phone, 40),
      email: clean(input.email, 200),
      agency: clean(input.agency, 120),
      created_by: session.userId,
    })
    .select("id, full_name, phone, email")
    .single();
  if (error || !data) {
    console.error("Adding a colleague failed:", error?.message ?? "no row");
    return null;
  }
  return { id: data.id, name: data.full_name, phone: data.phone, email: data.email };
}

/** Add or change a colleague. */
export async function savePartner(
  id: string | null,
  input: PartnerInput
): Promise<{ ok: true; id: string } | { ok: false; error: "duplicate" | "generic" | "name" }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "generic" };
  const name = input.full_name.trim();
  if (name.length < 2 || name.length > 120) return { ok: false, error: "name" };
  const supabase = await createClient();
  const row = {
    full_name: name,
    phone: clean(input.phone, 40),
    email: clean(input.email, 200),
    agency: clean(input.agency, 120),
    notes: clean(input.notes, 2000),
  };
  const { data, error } = id
    ? await supabase.from("partners").update(row).eq("id", id).select("id").single()
    : await supabase
        .from("partners")
        .insert({ ...row, organization_id: session.organizationId, created_by: session.userId })
        .select("id")
        .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "duplicate" };
    console.error("Saving a colleague failed:", error?.message ?? "no row");
    return { ok: false, error: "generic" };
  }
  revalidatePath("/partners");
  revalidatePath(`/partners/${data.id}`);
  return { ok: true, id: data.id };
}

export async function deletePartner(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partners").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false };
  revalidatePath("/partners");
  return { ok: true };
}

/**
 * A call (or a message, a meeting…) with a colleague, perhaps about a listing — logged in the
 * history, and a task to get back to them (tomorrow unless said otherwise).
 */
export async function logPartnerContact(input: {
  partner: PartnerPick;
  propertyId: string | null;
  type: "call" | "message" | "meeting" | "viewing" | "note";
  note: string;
  followUp: string | null;
}): Promise<{ ok: true; partnerId: string } | { ok: false }> {
  const session = await getSession();
  if (!session) return { ok: false };
  if (!["call", "message", "meeting", "viewing", "note"].includes(input.type) || input.note.length > 2000) return { ok: false };
  if (input.followUp && !/^\d{4}-\d{2}-\d{2}$/.test(input.followUp)) return { ok: false };
  const partner = await resolvePartner(input.partner);
  if (!partner) return { ok: false };
  const supabase = await createClient();

  const { error } = await supabase.from("activities").insert({
    organization_id: session.organizationId,
    profile_id: session.userId,
    type: input.type,
    property_id: input.propertyId,
    partner_id: partner.id,
    note: input.note.trim() || null,
  });
  if (error) {
    console.error("Logging a colleague's call failed:", error.message);
    return { ok: false };
  }

  if (input.followUp) {
    const { t } = await getI18n();
    let title: string | null = null;
    if (input.propertyId) {
      const { data } = await supabase.from("properties").select("title").eq("id", input.propertyId).maybeSingle();
      title = data?.title ?? null;
    }
    const { error: taskError } = await supabase.from("tasks").insert({
      organization_id: session.organizationId,
      assigned_to: session.userId,
      created_by: session.userId,
      title: (title ? fmt(t.partners.callTaskAbout, { name: partner.name, title }) : fmt(t.partners.callTask, { name: partner.name })).slice(0, 200),
      description: input.note.trim().slice(0, 2000) || null,
      type: "call",
      partner_id: partner.id,
      property_id: input.propertyId,
      due_date: input.followUp,
    });
    if (taskError) console.error("The call-back task failed:", taskError.message);
  }

  if (input.propertyId) revalidatePath(`/properties/${input.propertyId}`);
  revalidatePath(`/partners/${partner.id}`);
  revalidatePath("/tasks");
  return { ok: true, partnerId: partner.id };
}

/** A link to the listing for a colleague: it counts in the listing's marketing (and the owner's report). */
export async function shareWithPartner(
  propertyId: string,
  pick: PartnerPick
): Promise<{ ok: true; token: string; phone: string | null; email: string | null } | { ok: false }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const partner = await resolvePartner(pick);
  if (!partner) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_shares")
    .insert({ property_id: propertyId, organization_id: session.organizationId, partner_id: partner.id, created_by: session.userId })
    .select("token, property:properties(title)")
    .single();
  if (error || !data) {
    console.error("Sharing with a colleague failed:", error?.message ?? "no row");
    return { ok: false };
  }
  const title = (data.property as unknown as { title: string } | null)?.title ?? "";
  await supabase.from("activities").insert({
    organization_id: session.organizationId,
    profile_id: session.userId,
    type: "message",
    property_id: propertyId,
    partner_id: partner.id,
    note: `🔗 ${title}`,
  });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/partners/${partner.id}`);
  return { ok: true, token: data.token, phone: partner.phone, email: partner.email };
}
