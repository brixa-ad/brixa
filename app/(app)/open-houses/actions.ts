"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { PREP_STEPS, prepDay } from "@/lib/open-houses";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type OpenHouseInput = {
  propertyId: string;
  day: string;
  from: string;
  to: string;
  hostId: string;
  note: string;
};

export type OpenHouseErrors = Partial<Record<keyof OpenHouseInput, "required" | "invalid" | "range">>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Plan an open house: the event, then its preparation tasks day by day for the host. */
export async function planOpenHouse(input: OpenHouseInput): Promise<{ ok: false; errors?: OpenHouseErrors }> {
  const session = await getSession();
  if (!session) return { ok: false };

  const today = sofiaToday();
  const errors: OpenHouseErrors = {};
  if (!input.propertyId) errors.propertyId = "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || Number.isNaN(Date.parse(input.day))) errors.day = "invalid";
  else if (input.day < today) errors.day = "range";
  if (!TIME.test(input.from)) errors.from = "invalid";
  if (!TIME.test(input.to)) errors.to = "invalid";
  else if (!errors.from && input.to <= input.from) errors.to = "range";
  const hostId = session.isManager && input.hostId ? input.hostId : session.userId;
  if (input.note.length > 1000) errors.note = "invalid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const supabase = await createClient();
  const { data: house, error } = await supabase
    .from("open_houses")
    .insert({
      organization_id: session.organizationId,
      property_id: input.propertyId,
      host_id: hostId,
      day: input.day,
      starts_at: input.from,
      ends_at: input.to,
      note: input.note.trim() || null,
      created_by: session.userId,
    })
    .select("id, property:properties(title)")
    .single();
  if (error || !house) {
    console.error("Planning the open house failed:", error?.message);
    return { ok: false, errors: error ? undefined : { propertyId: "invalid" } };
  }

  // the preparation, as tasks for the host
  const { t } = await getI18n();
  // the host comes half an hour early (for the neighbours)
  const [h, m] = input.from.split(":").map(Number);
  const earlyMinutes = h * 60 + m - 30;
  const early = `${String(Math.floor(earlyMinutes / 60)).padStart(2, "0")}:${String(earlyMinutes % 60).padStart(2, "0")}`;
  const title = (house.property as unknown as { title: string } | null)?.title ?? "";
  const { error: tasksError } = await supabase.from("tasks").insert(
    PREP_STEPS.map((step) => ({
      organization_id: session.organizationId,
      assigned_to: hostId,
      created_by: session.userId,
      title: `${t.openHouses.taskPrefix}: ${t.openHouses.prep[step.key].title}`.slice(0, 200),
      type: step.type,
      property_id: input.propertyId,
      open_house_id: house.id,
      due_date: prepDay(input.day, step.offset, today),
      due_time: step.key === "host" && earlyMinutes >= 0 ? early : null,
      description: `${title}\n\n${t.openHouses.prep[step.key].text}`.slice(0, 2000),
    }))
  );
  if (tasksError) console.error("Creating the open house tasks failed:", tasksError.message);

  revalidatePath("/open-houses");
  revalidatePath(`/properties/${input.propertyId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
  redirect(`/open-houses/${house.id}`);
}

/** Cancel: the page stops taking sign-ins and the unfinished preparation goes away. */
export async function cancelOpenHouse(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("open_houses")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("cancelled_at", null)
    .select("property_id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  await supabase.from("tasks").delete().eq("open_house_id", id).eq("status", "open");
  revalidatePath(`/open-houses/${id}`);
  revalidatePath("/open-houses");
  revalidatePath(`/properties/${data.property_id}`);
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}
