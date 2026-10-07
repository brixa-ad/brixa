"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import type { PartnerPick } from "@/app/(app)/partners/actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { inputClass } from "@/components/ui/form";

export type PartnerOption = { id: string; full_name: string; agency: string | null; phone: string | null };

/** A colleague from the list, or a new one typed in on the spot (name, phone, agency). */
export function PartnerPicker({
  partners,
  onChange,
}: {
  partners: PartnerOption[];
  onChange: (pick: PartnerPick | null) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"list" | "new">(partners.length > 0 ? "list" : "new");
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState({ full_name: "", phone: "", agency: "" });

  function pickNew(next: typeof draft) {
    setDraft(next);
    onChange(next.full_name.trim().length >= 2 ? { new: { ...next, email: "" } } : null);
  }

  const tab = (active: boolean) =>
    `inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5">
        <button
          type="button"
          className={tab(mode === "list")}
          onClick={() => {
            setMode("list");
            onChange(picked ? { id: picked } : null);
          }}
        >
          <Users className="size-4" />
          {t.partners.pickExisting}
        </button>
        <button
          type="button"
          className={tab(mode === "new")}
          onClick={() => {
            setMode("new");
            pickNew(draft);
          }}
        >
          <UserPlus className="size-4" />
          {t.partners.addNew}
        </button>
      </div>
      {mode === "list" ? (
        <Combobox
          options={partners.map((p) => ({
            value: p.id,
            label: p.full_name,
            hint: [p.agency, p.phone].filter(Boolean).join(" · ") || undefined,
          }))}
          value={picked}
          onChange={(value) => {
            setPicked(value);
            onChange(value ? { id: value } : null);
          }}
          placeholder={t.partners.pick}
          emptyText={t.partners.noMatch}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={draft.full_name}
            onChange={(e) => pickNew({ ...draft, full_name: e.target.value })}
            placeholder={t.partners.name}
            aria-label={t.partners.name}
            maxLength={120}
            className={inputClass}
          />
          <input
            value={draft.phone}
            onChange={(e) => pickNew({ ...draft, phone: e.target.value })}
            placeholder={t.partners.phone}
            aria-label={t.partners.phone}
            inputMode="tel"
            maxLength={40}
            className={inputClass}
          />
          <input
            value={draft.agency}
            onChange={(e) => pickNew({ ...draft, agency: e.target.value })}
            placeholder={t.partners.agency}
            aria-label={t.partners.agency}
            maxLength={120}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
