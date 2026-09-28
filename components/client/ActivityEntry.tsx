"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Loader2, MessageSquareQuote, Pencil, Trash2 } from "lucide-react";
import { deleteActivity, updateActivity } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { TypeIcon } from "@/components/task/TypeIcon";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { fmt } from "@/lib/i18n/dictionaries";
import { ACTIVITY_OUTCOMES, type ActivityOutcome } from "@/lib/options";
import { OUTCOME_TONE } from "./QuickLog";

export type ActivityView = {
  id: string;
  type: string;
  note: string | null;
  feedback: string | null;
  outcome: ActivityOutcome | null;
  property: { id: string; title: string } | null;
  /** already formatted */
  when: string;
  who: string;
  canEdit: boolean;
};

/** One line of a client's history; tap it for what happened, the client's feedback and how it went. */
export function ActivityEntry({ activity }: { activity: ActivityView }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(activity.note ?? "");
  const [feedback, setFeedback] = useState(activity.feedback ?? "");
  const [outcome, setOutcome] = useState<ActivityOutcome | null>(activity.outcome);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const typeLabel = t.options.activityType[activity.type as keyof typeof t.options.activityType] ?? activity.type;

  function close() {
    setOpen(false);
    setEditing(false);
    setFailed(false);
  }

  function save() {
    setFailed(false);
    startTransition(async () => {
      const result = await updateActivity(activity.id, { note, feedback, outcome });
      if (result.ok) setEditing(false);
      else setFailed(true);
    });
  }

  function remove() {
    if (!window.confirm(t.activity.deleteEntryConfirm)) return;
    startTransition(async () => {
      const result = await deleteActivity(activity.id);
      if (result.ok) close();
      else setFailed(true);
    });
  }

  return (
    <li className="relative">
      <span className="absolute -left-[31px] top-0 grid size-5 place-items-center rounded-full border border-line bg-surface text-accent-fg">
        <TypeIcon type={activity.type} className="size-3" />
      </span>
      <button type="button" onClick={() => setOpen(true)} className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition hover:bg-raised">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">{typeLabel}</span>
          <span className="text-subtle">
            {activity.who} · {activity.when}
          </span>
          {activity.outcome && (
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${OUTCOME_TONE[activity.outcome]}`}>
              {t.options.activityOutcome[activity.outcome]}
            </span>
          )}
        </p>
        {activity.property && <p className="mt-0.5 truncate text-xs text-muted">{activity.property.title}</p>}
        {activity.note && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-fg-2">{activity.note}</p>}
        {activity.feedback && (
          <p className="mt-0.5 line-clamp-1 text-xs italic text-muted">„{activity.feedback}“</p>
        )}
      </button>

      {open && (
        <Modal title={`${typeLabel} · ${activity.when}`} onClose={close} wide>
          {!editing ? (
            <div className="space-y-4 text-sm">
              <p className="text-xs text-muted">{fmt(t.activity.by, { name: activity.who })}</p>
              {activity.property && (
                <Link href={`/properties/${activity.property.id}`} className="inline-flex items-center gap-1.5 font-medium text-accent-fg hover:underline">
                  <Building2 className="size-4" />
                  {activity.property.title}
                </Link>
              )}
              <p className="whitespace-pre-line text-fg-2">{activity.note || "—"}</p>
              <div className="rounded-xl bg-raised/60 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <MessageSquareQuote className="size-3.5" />
                  {t.activity.feedback}
                </p>
                <p className="whitespace-pre-line">{activity.feedback || <span className="text-muted">{t.activity.noFeedback}</span>}</p>
                {activity.outcome && (
                  <span className={`mt-2 inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${OUTCOME_TONE[activity.outcome]}`}>
                    {t.options.activityOutcome[activity.outcome]}
                  </span>
                )}
              </div>
              {failed && <p className="font-medium text-danger">{t.errors.generic}</p>}
              {activity.canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing(true)} className={buttonClass.secondary}>
                    <Pencil className="size-4" />
                    {t.activity.editEntry}
                  </button>
                  <button type="button" onClick={remove} disabled={pending} className={buttonClass.danger}>
                    <Trash2 className="size-4" />
                    {t.common.delete}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <NoteArea rows={3} maxLength={2000} value={note} onChange={setNote} placeholder={t.activity.notePlaceholder} aria-label={t.activity.notePlaceholder} />
              <NoteArea rows={3} maxLength={2000} value={feedback} onChange={setFeedback} placeholder={t.activity.feedbackPlaceholder} aria-label={t.activity.feedback} />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">{t.activity.outcome}:</span>
                {ACTIVITY_OUTCOMES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={outcome === key}
                    onClick={() => setOutcome(outcome === key ? null : key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      outcome === key ? OUTCOME_TONE[key] : "border-line-strong text-fg-2 hover:border-subtle"
                    }`}
                  >
                    {t.options.activityOutcome[key]}
                  </button>
                ))}
              </div>
              {!note.trim() && <p className="text-xs text-danger">{t.activity.noteRequired}</p>}
              {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className={`${buttonClass.secondary} flex-1`}>
                  {t.common.cancel}
                </button>
                <button type="button" onClick={save} disabled={pending || !note.trim()} className={`${buttonClass.primary} flex-1`}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {t.activity.saveEntry}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </li>
  );
}
