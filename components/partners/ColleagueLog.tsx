"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { logPartnerContact, type PartnerPick } from "@/app/(app)/partners/actions";
import { useI18n } from "@/components/I18nProvider";
import { TypeIcon } from "@/components/task/TypeIcon";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass, inputClass } from "@/components/ui/form";
import { PartnerPicker, type PartnerOption } from "./PartnerPicker";

const TYPES = ["call", "message", "meeting", "viewing", "note"] as const;

/**
 * A colleague called (or wrote, came to a viewing…): who, what was said — and a call back,
 * tomorrow unless changed. On a listing it's about that listing; on a colleague's card, about them.
 */
export function ColleagueLog({
  partners,
  propertyId = null,
  fixedPartner = null,
  tomorrow,
}: {
  partners: PartnerOption[];
  propertyId?: string | null;
  /** on a colleague's own card */
  fixedPartner?: string | null;
  tomorrow: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pick, setPick] = useState<PartnerPick | null>(fixedPartner ? { id: fixedPartner } : null);
  const [pickerKey, setPickerKey] = useState(0);
  const [type, setType] = useState<(typeof TYPES)[number]>("call");
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(true);
  const [followUp, setFollowUp] = useState(tomorrow);
  const [status, setStatus] = useState<"idle" | "saved" | "failed" | "name">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    if (!pick) {
      setStatus("name");
      return;
    }
    setStatus("idle");
    startTransition(async () => {
      const result = await logPartnerContact({ partner: pick, propertyId, type, note, followUp: remind ? followUp : null });
      if (!result.ok) {
        setStatus("failed");
        return;
      }
      setNote("");
      setRemind(true);
      setFollowUp(tomorrow);
      if (!fixedPartner) {
        setPick(null);
        setPickerKey((k) => k + 1);
      }
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {!fixedPartner && <PartnerPicker key={pickerKey} partners={partners} onChange={setPick} />}
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setType(key)}
            aria-pressed={type === key}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              type === key ? "border-accent bg-accent-soft text-accent-fg" : "border-line text-fg-2 hover:border-line-strong"
            }`}
          >
            <TypeIcon type={key} className="size-3.5" />
            {t.options.activityType[key]}
          </button>
        ))}
      </div>
      <NoteArea id={`colleague-note-${propertyId ?? fixedPartner ?? "x"}`} rows={2} maxLength={2000} value={note} onChange={setNote} placeholder={t.activity.notePlaceholder} />
      <label className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        {t.partners.remind}
        {remind && (
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value || tomorrow)}
            className={`${inputClass} w-auto! py-1!`}
          />
        )}
      </label>
      {status === "name" && <p className="text-sm text-danger">{t.partners.needName}</p>}
      {status === "failed" && <p className="text-sm text-danger">{t.errors.generic}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.partners.log}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.partners.logged}
          </span>
        )}
      </div>
    </div>
  );
}
