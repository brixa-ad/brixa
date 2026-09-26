import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, Clock, Pencil, Phone, User } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { CompleteTaskPanel, DeleteTaskButton } from "@/components/task/CompleteTaskPanel";
import { TypeIcon } from "@/components/task/TypeIcon";
import { Card, buttonClass } from "@/components/ui/form";
import { daysBetween, sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getTask, personName } from "@/lib/tasks";

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const task = await getTask((await params).id);
  return { title: task?.title ?? "Task" };
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const [{ t, lang }, task, session] = await Promise.all([getI18n(), getTask(id), getSession()]);
  if (!task || !session) notFound();

  const today = sofiaToday();
  const done = task.status === "done";
  const carriedDays = done ? 0 : daysBetween(task.due_date, today);
  const canEdit = session.isManager || task.created_by === session.userId;
  const canComplete = task.assigned_to === session.userId || canEdit;

  return (
    <>
      <PageHeader
        backHref="/tasks"
        backLabel={t.tasks.title}
        title={
          <span className="flex items-start gap-3">
            <span className={`mt-1 grid size-9 shrink-0 place-items-center rounded-xl ${done ? "bg-success/10 text-success" : "bg-accent-soft text-accent-fg"}`}>
              {done ? <CheckCircle2 className="size-5" /> : <TypeIcon type={task.type} className="size-5" />}
            </span>
            <span className={done ? "text-muted line-through" : ""}>{task.title}</span>
          </span>
        }
        actions={
          canEdit ? (
            <>
              <Link href={`/tasks/${id}/edit`} className={buttonClass.secondary}>
                <Pencil className="size-4" />
                {t.common.edit}
              </Link>
              <DeleteTaskButton taskId={id} />
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* ---- who / when ---- */}
          <Card>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t.tasks.fieldType}</dt>
                <dd className="mt-1 inline-flex items-center gap-1.5 font-medium">
                  <TypeIcon type={task.type} />
                  {t.options.taskType[task.type]}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.tasks.due}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4 text-subtle" />
                    {task.due_date === today ? t.tasks.today : formatDate(task.due_date, lang)}
                  </span>
                  {task.due_time && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4 text-subtle" />
                      {task.due_time.slice(0, 5)}
                    </span>
                  )}
                  {carriedDays > 0 && (
                    <span className="rounded-md bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning">
                      {carriedDays === 1 ? t.tasks.carriedOne : fmt(t.tasks.carried, { days: carriedDays })}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.tasks.assignedTo}</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium">
                  <Avatar path={task.assignee?.avatar_path} name={personName(task.assignee)} size="sm" />
                  {personName(task.assignee)}
                </dd>
              </div>
              {task.created_by && task.created_by !== task.assigned_to && (
                <div>
                  <dt className="text-xs text-muted">{t.tasks.givenBy}</dt>
                  <dd className="mt-1 flex items-center gap-2 font-medium">
                    <Avatar path={task.creator?.avatar_path} name={personName(task.creator)} size="sm" />
                    {personName(task.creator)}
                  </dd>
                </div>
              )}
            </dl>

            {task.description && (
              <p className="mt-5 whitespace-pre-line border-t border-line-soft pt-4 text-sm leading-relaxed text-fg-2">
                {task.description}
              </p>
            )}
          </Card>

          {/* ---- linked client & property ---- */}
          {task.client || task.property ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {task.client && (
                <Card>
                  <p className="text-xs font-medium text-muted">{t.tasks.linkedClient}</p>
                  <Link href={`/clients/${task.client.id}`} className="mt-1 flex items-center gap-2 font-semibold hover:text-accent-fg">
                    <User className="size-4 text-accent-fg" />
                    {task.client.full_name}
                  </Link>
                  {task.client.phone && (
                    <a
                      href={`tel:${task.client.phone.replace(/[^\d+]/g, "")}`}
                      className={`${buttonClass.primary} mt-4 w-full`}
                    >
                      <Phone className="size-4" />
                      {t.tasks.call} · {task.client.phone}
                    </a>
                  )}
                </Card>
              )}
              {task.property && (
                <Card>
                  <p className="text-xs font-medium text-muted">{t.tasks.linkedProperty}</p>
                  <Link href={`/properties/${task.property.id}`} className="mt-1 flex items-center gap-2 font-semibold hover:text-accent-fg">
                    <Building2 className="size-4 text-accent-fg" />
                    {task.property.title}
                  </Link>
                </Card>
              )}
            </div>
          ) : (
            <p className="px-1 text-sm text-muted">{t.tasks.noLink}</p>
          )}
        </div>

        {/* ---- tick off ---- */}
        <aside>
          <Card>
            {done ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="size-5" />
                  {fmt(t.tasks.doneBy, {
                    name: personName(task.completer ?? task.assignee),
                    when: task.completed_at ? formatDate(task.completed_at, lang, true) : "",
                  })}
                </p>
                {task.completion_note && (
                  <p className="whitespace-pre-line rounded-xl bg-raised p-3 text-sm text-fg-2">{task.completion_note}</p>
                )}
                {canComplete && <CompleteTaskPanel taskId={id} done />}
              </div>
            ) : canComplete ? (
              <CompleteTaskPanel taskId={id} done={false} />
            ) : null}
          </Card>
        </aside>
      </div>
    </>
  );
}
