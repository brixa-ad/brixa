"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAcademyEvery, isAcademyLevel, isAcademyTopic } from "@/lib/academy";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** What the database says when it won't start a test (069); anything else is "other". */
const START_ERRORS = ["academy_passed", "academy_wait", "academy_level_low", "academy_empty", "academy_exam_open"] as const;

/** Start a test (a form: mode, level, topic) and open it; a refusal goes back to the academy page with why. */
export async function startTest(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const mode = formData.get("mode") === "exam" ? "exam" : "practice";
  const level = Number(formData.get("level"));
  const topic = formData.get("topic");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("academy_start", {
    want_mode: mode,
    want_level: isAcademyLevel(level) ? level : null,
    want_topic: mode === "practice" && isAcademyTopic(topic) ? topic : null,
  });
  if (error || !data) {
    const code = START_ERRORS.find((c) => error?.message.includes(c)) ?? "other";
    if (code === "other") console.error("Starting a test failed:", error?.message);
    redirect(`/academy?error=${code}`);
  }
  revalidatePath("/academy");
  redirect(`/academy/test/${data}`);
}

export type AnswerResult =
  | { ok: true; finished?: boolean; right?: number; chosen?: number; explanation?: string | null }
  | { ok: false };

/** An answer: practice gets the right one and why at once; the exam only keeps it. */
export async function answerQuestion(attemptId: string, position: number, choice: number): Promise<AnswerResult> {
  const session = await getSession();
  if (!session || !Number.isInteger(position) || !Number.isInteger(choice)) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("academy_answer", { target: attemptId, pos: position, choice });
  if (error || !data) {
    console.error("Saving an answer failed:", error?.message);
    return { ok: false };
  }
  const r = data as { finished?: boolean; saved?: boolean; right?: number; chosen?: number; explanation?: string | null };
  return { ok: true, finished: r.finished, right: r.right, chosen: r.chosen, explanation: r.explanation ?? null };
}

/** Hand the test in: the database scores it (and issues the certificate when it's passed). */
export async function finishTest(attemptId: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("academy_finish", { target: attemptId });
  if (error) {
    console.error("Finishing a test failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/academy");
  revalidatePath(`/academy/test/${attemptId}`);
  return { ok: true };
}

/** A leader sets a person's level (null: back to the one from their BRIXA level). */
export async function setAcademyLevel(profileId: string, level: number | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  if (level !== null && !isAcademyLevel(level)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_academy_level", { target: profileId, new_level: level });
  if (error) {
    console.error("Setting the academy level failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/academy/team");
  return { ok: true };
}

/** The owner: how often the exam is and its pass mark. */
export async function setAcademyRules(every: string, passMark: number): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  if (!isAcademyEvery(every) || !Number.isInteger(passMark) || passMark < 50 || passMark > 100) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_academy_rules", { target_org: session.organizationId, every, pass_mark: passMark });
  if (error) {
    console.error("Setting the academy rules failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/academy");
  revalidatePath("/academy/team");
  return { ok: true };
}

export type QuestionInput = {
  id: string | null;
  topic: string;
  level: number;
  city: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  /** BRIXA's own question (the platform admin only) */
  brixa: boolean;
};

export type QuestionResult = { ok: true } | { ok: false; error: "question" | "options" | "generic" };

/** Add or change a question: the agency's own (its leaders), or BRIXA's (the platform admin). */
export async function saveQuestion(input: QuestionInput): Promise<QuestionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "generic" };
  if (input.brixa ? !session.platformAdmin : !session.isManager) return { ok: false, error: "generic" };
  if (!isAcademyTopic(input.topic) || !isAcademyLevel(input.level)) return { ok: false, error: "generic" };

  const question = String(input.question ?? "").trim();
  if (question.length < 5 || question.length > 600) return { ok: false, error: "question" };
  // the right answer stays marked when the empty ones are left out
  const rows = (input.options ?? []).map((text, i) => ({ text: String(text ?? "").trim().slice(0, 400), right: i === input.correct }));
  const kept = rows.filter((r) => r.text);
  const options = kept.map((r) => r.text);
  const correct = kept.findIndex((r) => r.right);
  if (options.length < 2 || options.length > 5 || new Set(options.map((o) => o.toLowerCase())).size !== options.length || correct < 0) {
    return { ok: false, error: "options" };
  }
  const city = input.topic === "city" ? String(input.city ?? "").trim().replace(/^гр\.\s*/i, "").slice(0, 80) || null : null;

  const values = {
    topic: input.topic,
    level: input.level,
    city,
    question,
    options,
    correct,
    explanation: String(input.explanation ?? "").trim().slice(0, 1000) || null,
  };
  const supabase = await createClient();
  const update = input.id ? supabase.from("academy_questions").update(values).eq("id", input.id) : null;
  const { error } = update
    ? await (input.brixa ? update.is("organization_id", null) : update.eq("organization_id", session.organizationId))
    : await supabase.from("academy_questions").insert({
        ...values,
        organization_id: input.brixa ? null : session.organizationId,
        created_by: session.userId,
      });
  if (error) {
    console.error("Saving a question failed:", error.message);
    return { ok: false, error: "generic" };
  }
  revalidatePath("/academy/questions");
  return { ok: true };
}

/** Turn a question off (it goes into no new test) or on again. */
export async function setQuestionActive(id: string, active: boolean): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || !(session.isManager || session.platformAdmin)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("academy_questions").update({ active }).eq("id", id);
  if (error) {
    console.error("Turning a question on/off failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/academy/questions");
  return { ok: true };
}

/** Delete one of the agency's own questions (BRIXA's are only turned off: tests done keep their copy anyway). */
export async function deleteQuestion(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("academy_questions").delete().eq("id", id).eq("organization_id", session.organizationId);
  if (error) {
    console.error("Deleting a question failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/academy/questions");
  return { ok: true };
}
