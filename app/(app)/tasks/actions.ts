"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { ACTIVITY_OUTCOMES, ACTIVITY_TYPES, isOneOf } from "@/lib/options";
import { advanceProgram } from "@/lib/programs-server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TASK_LIMITS, validateTask, type TaskErrors, type TaskInput } from "@/lib/task-validation";

export type TaskSaveResult = { ok: true; id: string } | { ok: false; errors?: TaskErrors; message?: "generic" };

function refresh(taskId?: string, clientId?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function saveTask(input: TaskInput, taskId?: string): Promise<TaskSaveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "generic" };

  const errors = validateTask(input);
  // Brokers plan their own work; managers hand tasks to anyone in the agency.
  if (!session.isManager && input.assignedTo !== session.userId) errors.assignedTo = "invalid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const supabase = await createClient();

  // Linked records must be visible to the person saving (RLS does the checking).
  const [member, client, property] = await Promise.all([
    supabase
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", session.organizationId)
      .eq("profile_id", input.assignedTo)
      .maybeSingle(),
    input.clientId
      ? supabase.from("clients").select("id").eq("id", input.clientId).not("responsible_broker_id", "is", null).maybeSingle()
      : { data: true },
    input.propertyId
      ? supabase.from("properties").select("id").eq("id", input.propertyId).maybeSingle()
      : { data: true },
  ]);
  if (!member.data) return { ok: false, errors: { assignedTo: "invalid" } };
  if (!client.data) return { ok: false, errors: { clientId: "invalid" } };
  if (!property.data) return { ok: false, errors: { propertyId: "invalid" } };

  const row = {
    title: input.title.trim(),
    type: input.type,
    assigned_to: input.assignedTo,
    client_id: input.clientId,
    property_id: input.propertyId,
    due_date: input.dueDate,
    due_time: input.dueTime,
    description: input.description.trim() || null,
  };

  const { data, error } = taskId
    ? await supabase.from("tasks").update(row).eq("id", taskId).select("id").maybeSingle()
    : await supabase
        .from("tasks")
        .insert({ ...row, organization_id: session.organizationId, created_by: session.userId })
        .select("id")
        .single();

  if (error || !data) {
    console.error("Saving task failed:", error?.message ?? "no row");
    return { ok: false, message: "generic" };
  }

  refresh(data.id, input.clientId);
  return { ok: true, id: data.id };
}

/** Tick off (with what happened — required) or reopen. The database logs the activity. */
export async function setTaskDone(taskId: string, done: boolean, note?: string) {
  if (done && !note?.trim()) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: done ? "done" : "open",
      completion_note: done ? (note?.trim().slice(0, TASK_LIMITS.note) || null) : null,
    })
    .eq("id", taskId)
    .select("id, client_id, program_id, program_step")
    .maybeSingle();

  if (error || !data) {
    console.error("Updating task failed:", error?.message ?? "no row");
    return { ok: false };
  }
  // a step of a contact program: the next one opens
  if (done && data.program_id && data.program_step !== null) {
    const [session, { t }] = await Promise.all([getSession(), getI18n()]);
    if (session) await advanceProgram(supabase, session, t, data.program_id, data.program_step);
  }
  refresh(taskId, data.client_id);
  return { ok: true };
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("id, client_id");
  if (error || !data?.length) return { ok: false };
  refresh(undefined, data[0].client_id);
  redirect("/tasks");
}

/** "I called / met / showed…" logged straight from a client's page — always with a note. */
export async function logActivity(input: {
  type: string;
  clientId: string | null;
  propertyId: string | null;
  note: string;
  feedback?: string;
  outcome?: string | null;
}) {
  if (!isOneOf(ACTIVITY_TYPES, input.type) || input.type === "task") return { ok: false };
  if (!input.note.trim()) return { ok: false };
  if (input.outcome && !isOneOf(ACTIVITY_OUTCOMES, input.outcome)) return { ok: false };
  const session = await getSession();
  if (!session) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    organization_id: session.organizationId,
    profile_id: session.userId,
    type: input.type,
    client_id: input.clientId,
    property_id: input.propertyId,
    note: input.note.trim().slice(0, TASK_LIMITS.note),
    feedback: input.feedback?.trim().slice(0, TASK_LIMITS.note) || null,
    outcome: input.outcome || null,
  });
  if (error) {
    console.error("Logging activity failed:", error.message);
    return { ok: false };
  }
  if (input.clientId) revalidatePath(`/clients/${input.clientId}`);
  if (input.propertyId) revalidatePath(`/properties/${input.propertyId}`);
  // a contact moves the client's follow-up deadline
  if (input.clientId) revalidatePath("/follow-up");
  revalidatePath("/");
  return { ok: true };
}

export async function markNotificationsRead() {
  const session = await getSession();
  if (!session) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", session.userId)
    .is("read_at", null);
  revalidatePath("/", "layout");
}

/** Complete or correct an entry in the history (the author or a manager; the database checks). */
export async function updateActivity(
  activityId: string,
  input: { note: string; feedback: string; outcome: string | null }
): Promise<{ ok: boolean }> {
  if (!input.note.trim()) return { ok: false };
  if (input.outcome && !isOneOf(ACTIVITY_OUTCOMES, input.outcome)) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({
      note: input.note.trim().slice(0, TASK_LIMITS.note),
      feedback: input.feedback.trim().slice(0, TASK_LIMITS.note) || null,
      outcome: input.outcome || null,
    })
    .eq("id", activityId)
    .select("client_id, property_id")
    .maybeSingle();
  if (error || !data) {
    console.error("Updating activity failed:", error?.message ?? "no row");
    return { ok: false };
  }
  if (data.client_id) revalidatePath(`/clients/${data.client_id}`);
  if (data.property_id) revalidatePath(`/properties/${data.property_id}`);
  return { ok: true };
}

export async function deleteActivity(activityId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").delete().eq("id", activityId).select("client_id, property_id");
  if (error || !data?.length) return { ok: false };
  if (data[0].client_id) {
    revalidatePath(`/clients/${data[0].client_id}`);
    revalidatePath("/follow-up");
  }
  if (data[0].property_id) revalidatePath(`/properties/${data[0].property_id}`);
  return { ok: true };
}
