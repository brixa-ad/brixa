"use client";

import { useState, useTransition } from "react";
import { Check, Hand, Loader2 } from "lucide-react";
import { assignClient, claimClient } from "@/app/(app)/follow-up/actions";
import { logActivity } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { Modal } from "@/components/ui/Modal";
import { buttonClass, inputClass } from "@/components/ui/form";

/** "Take" a free contact — the first broker to press gets the client. */
export function ClaimButton({ clientId, wide = false }: { clientId: string; wide?: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"taken" | "gone" | null>(null);

  if (result === "taken") return <span className="text-sm font-semibold text-success">{t.contacts.taken}</span>;
  if (result === "gone") return <span className="text-sm text-muted">{t.contacts.gone}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { ok } = await claimClient(clientId);
          setResult(ok ? "taken" : "gone");
        })
      }
      className={`${buttonClass.primary} ${wide ? "w-full" : ""}`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />}
      {t.contacts.take}
    </button>
  );
}

/** Managers: give a client to a colleague (or back to the free contacts). */
export function AssignSelect({
  clientId,
  current,
  members,
  label,
  allowFree = true,
}: {
  clientId: string;
  current: string | null;
  members: { id: string; name: string }[];
  label: string;
  allowFree?: boolean;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={label}
      value=""
      disabled={pending}
      onChange={(e) => {
        const to = e.target.value;
        if (!to) return;
        startTransition(async () => {
          await assignClient(clientId, to as string | "free");
        });
      }}
      className={`${inputClass} w-auto py-1.5! text-xs!`}
    >
      <option value="">{pending ? "…" : label}</option>
      {members
        .filter((m) => m.id !== current)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      {allowFree && current !== null && <option value="free">{t.followUp.toFree}</option>}
    </select>
  );
}

/** "We spoke" — asks how it went (required), logs a call in the client's history, which moves the deadline. */
export function ContactedButton({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  function save() {
    setFailed(false);
    startTransition(async () => {
      const { ok } = await logActivity({ type: "call", clientId, propertyId: null, note });
      if (ok) {
        setDone(true);
        setAsking(false);
      } else setFailed(true);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending || done}
        title={t.followUp.doneHint}
        onClick={() => setAsking(true)}
        className={`${buttonClass.secondary} whitespace-nowrap px-3! py-1.5! text-xs!`}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {t.followUp.done}
      </button>
      {asking && (
        <Modal title={t.done.contactedTitle} onClose={() => setAsking(false)}>
          <div className="space-y-3">
            <p className="text-sm text-muted">{t.done.hint}</p>
            <NoteArea rows={4} autoFocus maxLength={2000} value={note} placeholder={t.contact.logPlaceholder} onChange={setNote} />
            {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
            <button type="button" onClick={save} disabled={pending || !note.trim()} className={`${buttonClass.primary} w-full py-3`}>
              {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              {t.contact.logSave}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
