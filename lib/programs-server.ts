import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, sofiaToday } from "./dates";
import type { Dictionary } from "./i18n/dictionaries";
import { PROGRAMS, daysToNext, fillText, firstName, isProgram, type ProgramKey } from "./programs";
import type { SessionContext } from "./session";

type ProgramRow = {
  id: string;
  organization_id: string;
  client_id: string;
  program: ProgramKey;
  step: number;
  round: number;
  status: "active" | "stopped" | "finished";
};

/** Opens the task for a program's step: the step's title and its ready text, for the client's broker. */
export async function createStepTask(
  supabase: SupabaseClient,
  session: SessionContext,
  t: Dictionary,
  program: Pick<ProgramRow, "id" | "organization_id" | "client_id" | "program">,
  step: number,
  due: string
) {
  const { data: client } = await supabase
    .from("clients")
    .select("full_name, responsible_broker_id, broker:profiles!clients_responsible_broker_id_fkey(full_name, email)")
    .eq("id", program.client_id)
    .maybeSingle();
  if (!client?.responsible_broker_id) return { ok: false as const };

  const broker = client.broker as unknown as { full_name: string | null; email: string } | null;
  const def = PROGRAMS[program.program];
  const copy = t.programs.steps[program.program][step];
  // a manager hands the step to the client's broker; a broker takes it on themselves
  const assignee = session.isManager ? client.responsible_broker_id : session.userId;

  const { error } = await supabase.from("tasks").insert({
    organization_id: program.organization_id,
    assigned_to: assignee,
    created_by: session.userId,
    title: `${t.programs.short[program.program]} ${step + 1}/${def.steps.length}: ${copy.title}`.slice(0, 200),
    type: def.steps[step].type,
    client_id: program.client_id,
    due_date: due,
    description: fillText(copy.text, {
      name: firstName(client.full_name),
      broker: broker?.full_name || broker?.email || "",
      agency: session.organizationName,
    }).slice(0, 2000),
    program_id: program.id,
    program_step: step,
  });
  if (error) console.error("Opening a program step failed:", error.message);
  return { ok: !error };
}

/** A step's task was ticked off: move the program on and open the next step (or finish it). */
export async function advanceProgram(
  supabase: SupabaseClient,
  session: SessionContext,
  t: Dictionary,
  programId: string,
  doneStep: number
) {
  const { data } = await supabase
    .from("contact_programs")
    .select("id, organization_id, client_id, program, step, round, status")
    .eq("id", programId)
    .maybeSingle();
  const program = data as ProgramRow | null;
  // only the step that's current (a task reopened and ticked again doesn't skip ahead)
  if (!program || program.status !== "active" || !isProgram(program.program) || program.step !== doneStep) return;

  const next = daysToNext(program.program, program.step);
  if (!next) {
    await supabase.from("contact_programs").update({ status: "finished" }).eq("id", program.id).eq("step", doneStep);
    return;
  }
  const { data: moved } = await supabase
    .from("contact_programs")
    .update({ step: next.step, round: program.round + (next.newRound ? 1 : 0) })
    .eq("id", program.id)
    .eq("step", doneStep)
    .select("id")
    .maybeSingle();
  if (!moved) return;
  await createStepTask(supabase, session, t, program, next.step, addDays(sofiaToday(), next.days));
}
