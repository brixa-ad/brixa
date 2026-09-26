import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { TaskForm } from "@/components/task/TaskForm";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getTaskFormLookups } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.tasks.newTask };
}

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const [{ t }, lookups] = await Promise.all([getI18n(), getTaskFormLookups(session.organizationId)]);

  // Opened from a client or property page → pre-link it.
  const clientId = typeof params.client === "string" ? params.client : null;
  const propertyId = typeof params.property === "string" ? params.property : null;
  const assignee = typeof params.assignee === "string" && session.isManager ? params.assignee : session.userId;
  const client = lookups.clients.find((c) => c.id === clientId);

  return (
    <>
      <PageHeader backHref="/tasks" backLabel={t.tasks.title} title={t.tasks.newTask} />
      <TaskForm
        lookups={lookups}
        canAssign={session.isManager}
        today={sofiaToday()}
        initial={{
          title: client ? `${t.options.taskType.call}: ${client.full_name}` : "",
          type: "call",
          assignedTo: assignee,
          clientId: client ? client.id : null,
          propertyId: lookups.properties.some((p) => p.id === propertyId) ? propertyId : null,
          dueDate: sofiaToday(),
          dueTime: null,
          description: "",
        }}
      />
    </>
  );
}
