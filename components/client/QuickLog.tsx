"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { logActivity } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { TypeIcon } from "@/components/task/TypeIcon";
import { Combobox } from "@/components/ui/Combobox";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { ACTIVITY_OUTCOMES, type ActivityOutcome } from "@/lib/options";

const QUICK_TYPES = ["call", "email", "message", "meeting", "viewing", "note"] as const;
/** For these the client's reaction matters: feedback and how it went. */
const WITH_FEEDBACK = new Set<string>(["call", "meeting", "viewing"]);

export const OUTCOME_TONE: Record<ActivityOutcome, string> = {
  positive: "border-success bg-success/10 text-success",
  neutral: "border-warning bg-warning/10 text-warning",
  negative: "border-danger bg-danger/10 text-danger",
};

/** Log what just happened with a client (or around a property): always with a note. */
export function QuickLog({
  clientId = null,
  propertyId = null,
  properties,
}: {
  clientId?: string | null;
  propertyId?: string | null;
  /** listings to pick from for a viewing (on a client's page) */
  properties?: { id: string; title: string }[];
}) {
  const { t } = useI18n();
  const [type, setType] = useState<(typeof QUICK_TYPES)[number]>("call");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [outcome, setOutcome] = useState<ActivityOutcome | null>(null);
  const [viewed, setViewed] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const detailed = WITH_FEEDBACK.has(type);

  function save() {
    setStatus("idle");
    startTransition(async () => {
      const result = await logActivity({
        type,
        clientId,
        propertyId: propertyId ?? (type === "viewing" ? viewed : null),
        note,
        feedback: detailed ? feedback : "",
        outcome: detailed ? outcome : null,
      });
      if (result.ok) {
        setNote("");
        setFeedback("");
        setOutcome(null);
        setViewed(null);
        setStatus("saved");
      } else setStatus("failed");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t.activity.logTitle}>
        {QUICK_TYPES.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={type === key}
            onClick={() => {
              setType(key);
              setStatus("idle");
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              type === key ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
            }`}
          >
            <TypeIcon type={key} className="size-3.5" />
            {t.options.activityType[key]}
          </button>
        ))}
      </div>

      {type === "viewing" && !propertyId && properties && properties.length > 0 && (
        <Combobox
          options={properties.map((p) => ({ value: p.id, label: p.title }))}
          value={viewed}
          onChange={setViewed}
          placeholder={t.activity.propertyNone}
          emptyText={t.location.noMatches}
          aria-label={t.activity.property}
        />
      )}

      <NoteArea
        rows={2}
        value={note}
        maxLength={2000}
        onChange={(value) => {
          setNote(value);
          setStatus("idle");
        }}
        placeholder={t.activity.notePlaceholder}
        aria-label={t.activity.notePlaceholder}
      />

      {detailed && (
        <>
          <NoteArea
            rows={2}
            value={feedback}
            maxLength={2000}
            onChange={setFeedback}
            placeholder={t.activity.feedbackPlaceholder}
            aria-label={t.activity.feedback}
          />
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
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !note.trim()} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : t.activity.save}
        </button>
        {status === "saved" && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" />
            {t.activity.saved}
          </p>
        )}
        {status === "failed" && <p className="text-xs font-medium text-danger">{t.errors.generic}</p>}
      </div>
    </div>
  );
}
