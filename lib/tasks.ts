import "server-only";
import { cache } from "react";
import { sofiaDay } from "./dates";
import { getMembers } from "./lookups";
import type { TaskType } from "./options";
import { createClient } from "./supabase/server";

type Person = { full_name: string | null; email: string; avatar_path?: string | null };

export type TaskRow = {
  id: string;
  title: string;
  type: TaskType;
  status: "open" | "done";
  due_date: string;
  due_time: string | null;
  description: string | null;
  completed_at: string | null;
  completion_note: string | null;
  assigned_to: string;
  created_by: string | null;
  /** null when not linked, or when the client isn't visible to this user */
  client: { id: string; full_name: string; phone: string | null } | null;
  property: { id: string; title: string } | null;
  assignee: Person | null;
  creator: Person | null;
  completer: Person | null;
};

export const TASK_SELECT = `id, title, type, status, due_date, due_time, description, completed_at, completion_note,
  assigned_to, created_by,
  client:clients(id, full_name, phone),
  property:properties(id, title),
  assignee:profiles!tasks_assigned_to_fkey(full_name, email, avatar_path),
  creator:profiles!tasks_created_by_fkey(full_name, email, avatar_path),
  completer:profiles!tasks_completed_by_fkey(full_name, email)`;

export const personName = (p: Person | null | undefined) => p?.full_name || p?.email || "—";

/** Sort: carried-over first, then by day, timed tasks before untimed ones. */
export function byDue(a: TaskRow, b: TaskRow) {
  return (
    a.due_date.localeCompare(b.due_date) ||
    (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
    a.title.localeCompare(b.title)
  );
}

/** A user's day: what's open (incl. carried over) and what they finished today. */
export async function getMyDay(userId: string, today: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();

  const [open, done, upcoming] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("assigned_to", userId).eq("status", "open").lte("due_date", today),
    supabase.from("tasks").select(TASK_SELECT).eq("assigned_to", userId).eq("status", "done").gte("completed_at", since),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", userId)
      .eq("status", "open")
      .gt("due_date", today),
  ]);

  const openTasks = ((open.data ?? []) as unknown as TaskRow[]).sort(byDue);
  const doneToday = ((done.data ?? []) as unknown as TaskRow[]).filter(
    (t) => t.completed_at && sofiaDay(t.completed_at) === today
  );

  return { open: openTasks, doneToday, upcomingCount: upcoming.count ?? 0 };
}

/** Managers: per-colleague progress for today. */
export async function getTeamDay(organizationId: string, today: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();

  const [open, done] = await Promise.all([
    supabase
      .from("tasks")
      .select("assigned_to, due_date")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .lte("due_date", today),
    supabase
      .from("tasks")
      .select("assigned_to, completed_at")
      .eq("organization_id", organizationId)
      .eq("status", "done")
      .gte("completed_at", since),
  ]);

  const byPerson = new Map<string, { open: number; done: number; overdue: number }>();
  const entry = (id: string) => {
    if (!byPerson.has(id)) byPerson.set(id, { open: 0, done: 0, overdue: 0 });
    return byPerson.get(id)!;
  };
  for (const t of open.data ?? []) {
    const e = entry(t.assigned_to);
    e.open++;
    if (t.due_date < today) e.overdue++;
  }
  for (const t of done.data ?? []) {
    if (t.completed_at && sofiaDay(t.completed_at) === today) entry(t.assigned_to).done++;
  }
  return byPerson;
}

export const getTask = cache(async (id: string): Promise<TaskRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("Loading task failed:", error.message);
    return null;
  }
  return data as unknown as TaskRow | null;
});

/** Choices for the task form: colleagues, visible clients, agency properties. */
export async function getTaskFormLookups(organizationId: string) {
  const supabase = await createClient();
  const [members, clients, properties] = await Promise.all([
    getMembers(supabase, organizationId),
    supabase.from("clients").select("id, full_name, phone").eq("organization_id", organizationId).order("full_name").limit(1000),
    supabase
      .from("properties")
      .select("id, title")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);
  return { members, clients: clients.data ?? [], properties: properties.data ?? [] };
}
