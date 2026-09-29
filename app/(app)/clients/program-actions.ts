"use server";

import { revalidatePath } from "next/cache";
import { addDays, sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { PROGRAMS, isProgram } from "@/lib/programs";
import { createStepTask } from "@/lib/programs-server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; reason?: "needsBroker" | "alreadyActive" };

function refresh(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
}

/** Put a client in a contact program: its first step becomes a task at once. */
export async function startProgram(clientId: string, program: string): Promise<Result> {
  const session = await getSession();
  if (!session || !isProgram(program)) return { ok: false };
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, organization_id, responsible_broker_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { ok: false };
  if (!client.responsible_broker_id) return { ok: false, reason: "needsBroker" };
  if (!session.isManager && client.responsible_broker_id !== session.userId) return { ok: false };

  const { data: row, error } = await supabase
    .from("contact_programs")
    .insert({ organization_id: client.organization_id, client_id: clientId, program, created_by: session.userId })
    .select("id, organization_id, client_id, program")
    .single();
  if (error || !row) {
    if (error?.code === "23505") return { ok: false, reason: "alreadyActive" };
    console.error("Starting a program failed:", error?.message);
    return { ok: false };
  }

  const { t } = await getI18n();
  await createStepTask(supabase, session, t, { ...row, program }, 0, addDays(sofiaToday(), PROGRAMS[program].steps[0].day));
  refresh(clientId);
  return { ok: true };
}

/** Stop a program; its open step goes away. */
export async function stopProgram(programId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_programs")
    .update({ status: "stopped" })
    .eq("id", programId)
    .eq("status", "active")
    .select("client_id")
    .maybeSingle();
  if (!data) return { ok: false };
  await supabase.from("tasks").delete().eq("program_id", programId).eq("status", "open");
  refresh(data.client_id);
  return { ok: true };
}

/** The current step's task went missing (deleted): open it again for today. */
export async function resumeProgram(programId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const [{ data: program }, { count }] = await Promise.all([
    supabase.from("contact_programs").select("id, organization_id, client_id, program, step, status").eq("id", programId).maybeSingle(),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("program_id", programId).eq("status", "open"),
  ]);
  if (!program || program.status !== "active" || !isProgram(program.program) || (count ?? 0) > 0) return { ok: false };
  const { t } = await getI18n();
  const result = await createStepTask(supabase, session, t, { ...program, program: program.program }, program.step, sofiaToday());
  refresh(program.client_id);
  return result.ok ? { ok: true } : { ok: false };
}
