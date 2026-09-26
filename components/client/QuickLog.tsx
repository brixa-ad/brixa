"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { logActivity } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { TypeIcon } from "@/components/task/TypeIcon";
import { buttonClass, inputClass } from "@/components/ui/form";

const QUICK_TYPES = ["call", "email", "message", "meeting", "viewing", "note"] as const;

/** Log what just happened with a client in two taps. */
export function QuickLog({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [type, setType] = useState<(typeof QUICK_TYPES)[number]>("call");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus("idle");
    startTransition(async () => {
      const result = await logActivity({ type, clientId, propertyId: null, note });
      if (result.ok) {
        setNote("");
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
      <div className="flex gap-2">
        <input
          value={note}
          maxLength={2000}
          onChange={(e) => {
            setNote(e.target.value);
            setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder={t.activity.notePlaceholder}
          aria-label={t.activity.notePlaceholder}
          className={inputClass}
        />
        <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : t.activity.save}
        </button>
      </div>
      {status === "saved" && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 className="size-3.5" />
          {t.activity.saved}
        </p>
      )}
      {status === "failed" && <p className="text-xs font-medium text-danger">{t.errors.generic}</p>}
    </div>
  );
}
