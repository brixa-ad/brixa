"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { addOwnerClient } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";

export type OwnerOption = { id: string; full_name: string; phone: string | null };

/**
 * Whose the listing is: a client of the listing's broker — picked from their clients, or added
 * right here with a name and a phone (the rest is filled in on the client later).
 */
export function SellerField({
  clients,
  value,
  onChange,
  landlord,
  brokerId,
  required,
  error,
  disabled,
}: {
  clients: OwnerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** a listing for rent: the landlord */
  landlord: boolean;
  /** the listing's broker: the new client is theirs */
  brokerId: string | null;
  required: boolean;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const F = t.form;
  const [added, setAdded] = useState<OwnerOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const options = [...added, ...clients.filter((c) => !added.some((a) => a.id === c.id))].map((c) => ({
    value: c.id,
    label: c.full_name,
    hint: c.phone ?? undefined,
  }));

  async function add() {
    if (name.trim().length < 2) {
      setProblem(name.trim() ? t.errors.tooShort : t.errors.required);
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await addOwnerClient({ fullName: name, phone, landlord, brokerId, note: F.sellerNote });
    setBusy(false);
    if (!result.ok) {
      setProblem(
        result.duplicateOf
          ? result.duplicateOf === "#free"
            ? t.followUp.duplicateFree
            : fmt(t.clients.duplicatePhone, { name: result.duplicateOf })
          : result.error
            ? t.errors[result.error]
            : t.errors.generic
      );
      return;
    }
    const owner = { id: result.id, full_name: name.trim(), phone: phone.trim() || null };
    setAdded((current) => [owner, ...current]);
    onChange(owner.id);
    setAdding(false);
    setName("");
    setPhone("");
  }

  // the outer form must not be sent by Enter here
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void add();
    }
  };

  return (
    <div className="space-y-2">
      <Field label={landlord ? F.landlord : F.seller} required={required} error={error} hint={F.sellerHint}>
        {(props) => (
          <Combobox
            {...props}
            options={options}
            value={value}
            onChange={onChange}
            placeholder={F.sellerSearch}
            emptyText={landlord ? F.sellerNoneLandlord : F.sellerNone}
            disabled={disabled}
          />
        )}
      </Field>

      {adding ? (
        <div className="space-y-3 rounded-xl border border-line bg-raised/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">{landlord ? F.newLandlord : F.newSeller}</p>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setProblem(null);
              }}
              aria-label={t.common.cancel}
              title={t.common.cancel}
              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onEnter}
              maxLength={120}
              autoFocus
              autoComplete="off"
              placeholder={F.sellerName}
              aria-label={F.sellerName}
              className={inputClass}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={onEnter}
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="off"
              placeholder={F.sellerPhone}
              aria-label={F.sellerPhone}
              className={inputClass}
            />
          </div>
          {problem && <p className="text-xs font-medium text-danger">{problem}</p>}
          <button type="button" onClick={() => void add()} disabled={busy} className={buttonClass.primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {F.sellerAdd}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} disabled={disabled} className={buttonClass.ghost}>
          <Plus className="size-4" />
          {landlord ? F.newLandlord : F.newSeller}
        </button>
      )}
    </div>
  );
}
