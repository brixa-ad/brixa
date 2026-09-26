import Link from "next/link";
import { Clock, User } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { daysBetween } from "@/lib/dates";
import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";
import { personName, type TaskRow } from "@/lib/tasks";
import { TaskCheckbox } from "./TaskCheckbox";
import { TypeIcon } from "./TypeIcon";

/** A task row: tick box, what to do, who it's with, and why it matters (carried over, from the manager). */
export function TaskItem({
  task,
  today,
  viewerId,
  t,
  showAssignee = false,
}: {
  task: TaskRow;
  today: string;
  viewerId: string;
  t: Dictionary;
  showAssignee?: boolean;
}) {
  const done = task.status === "done";
  const carriedDays = done ? 0 : daysBetween(task.due_date, today);
  const fromSomeoneElse = task.created_by && task.created_by !== task.assigned_to && task.created_by !== viewerId;

  return (
    <li className="flex items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-raised">
      <TaskCheckbox taskId={task.id} done={done} />
      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <div>
          <p className={`font-medium leading-snug ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <TypeIcon type={task.type} className="size-3.5" />
              {t.options.taskType[task.type]}
            </span>
            {task.client && (
              <span className="inline-flex items-center gap-1 text-fg-2">
                <User className="size-3.5" />
                {task.client.full_name}
              </span>
            )}
            {task.due_time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {task.due_time.slice(0, 5)}
              </span>
            )}
            {showAssignee && task.assignee && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar path={task.assignee.avatar_path} name={personName(task.assignee)} size="sm" className="size-4! text-[8px]!" />
                {personName(task.assignee)}
              </span>
            )}
          </p>
          {(carriedDays > 0 || fromSomeoneElse) && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {carriedDays > 0 && (
                <span className="rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                  {carriedDays === 1 ? t.tasks.carriedOne : fmt(t.tasks.carried, { days: carriedDays })}
                </span>
              )}
              {fromSomeoneElse && (
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">
                  {fmt(t.tasks.from, { name: personName(task.creator) })}
                </span>
              )}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
