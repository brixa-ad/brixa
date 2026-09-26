import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { TaskForm } from "@/components/task/TaskForm";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getTask, getTaskFormLookups } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.tasks.editTask };
}

export default async function EditTaskPage({ params }: PageProps<"/tasks/[id]/edit">) {
  const { id } = await params;
  const session = (await getSession())!;
  const [{ t }, task, lookups] = await Promise.all([getI18n(), getTask(id), getTaskFormLookups(session.organizationId)]);

  if (!task) notFound();
  // Only whoever gave the task (or a manager) changes it; the assignee just ticks it off.
  if (!session.isManager && task.created_by !== session.userId) redirect(`/tasks/${id}`);

  return (
    <>
      <PageHeader backHref={`/tasks/${id}`} backLabel={task.title} title={t.tasks.editTask} />
      <TaskForm
        taskId={id}
        lookups={lookups}
        canAssign={session.isManager}
        today={sofiaToday()}
        initial={{
          title: task.title,
          type: task.type,
          assignedTo: task.assigned_to,
          clientId: task.client?.id ?? null,
          propertyId: task.property?.id ?? null,
          dueDate: task.due_date,
          dueTime: task.due_time ? task.due_time.slice(0, 5) : null,
          description: task.description ?? "",
        }}
      />
    </>
  );
}
