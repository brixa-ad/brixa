"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2, UserPlus } from "lucide-react";
import { deletePartner, savePartner, type PartnerInput } from "@/app/(app)/partners/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";

/** A new colleague, or a colleague's details changed (and deleted). */
export function PartnerForm({ partner }: { partner?: (PartnerInput & { id: string }) | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: PartnerInput = { full_name: "", phone: "", email: "", agency: "", notes: "" };
  const [draft, setDraft] = useState<PartnerInput>(partner ?? empty);
  const [error, setError] = useState<"duplicate" | "generic" | "name" | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePartner(partner?.id ?? null, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (partner) router.refresh();
      else router.push(`/partners/${result.id}`);
    });
  }

  function remove() {
    if (!partner || !window.confirm(t.partners.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deletePartner(partner.id);
      if (result.ok) router.push("/partners");
      else setError("generic");
    });
  }

  const field = (key: keyof PartnerInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg-2" htmlFor={`partner-${key}`}>
        {label}
      </label>
      <input
        id={`partner-${key}`}
        value={draft[key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className={inputClass}
        {...props}
      />
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(partner ?? empty);
          setError(null);
          setOpen(true);
        }}
        className={partner ? buttonClass.secondary : buttonClass.primary}
      >
        {partner ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
        {partner ? t.partners.edit : t.partners.newPartner}
      </button>
      {open && (
        <Modal title={partner ? t.partners.editTitle : t.partners.newPartner} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {field("full_name", t.partners.name, { maxLength: 120, autoFocus: true })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("phone", t.partners.phone, { maxLength: 40, inputMode: "tel" })}
              {field("agency", t.partners.agency, { maxLength: 120 })}
            </div>
            {field("email", t.partners.email, { maxLength: 200, type: "email" })}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-fg-2" htmlFor="partner-notes">
                {t.partners.notes}
              </label>
              <NoteArea id="partner-notes" rows={3} maxLength={2000} value={draft.notes ?? ""} onChange={(notes) => setDraft({ ...draft, notes })} />
            </div>
            {error && (
              <p className="text-sm text-danger">
                {error === "duplicate" ? t.partners.duplicate : error === "name" ? t.partners.needName : t.errors.generic}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={save} disabled={pending} className={`${buttonClass.primary} flex-1`}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.partners.save}
              </button>
              {partner && (
                <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.ghost} text-danger`} aria-label={t.partners.delete}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
