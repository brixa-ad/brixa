"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { savePartnerSearch } from "@/app/(app)/partner-searches/actions";
import { SearchFields, fromSearchDraft, toSearchDraft, type SearchDraft } from "@/components/client/SearchFields";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import type { ClientFormLookups } from "@/lib/clients";
import { PARTNER_LIMITS, validatePartnerSearch, type PartnerSearchErrors, type PartnerSearchInput } from "@/lib/partner-validation";

type Draft = Omit<PartnerSearchInput, "search"> & { search: SearchDraft };

/** A colleague from another agency and what their buyer wants. */
export function PartnerSearchForm({
  id,
  initial,
  lookups,
}: {
  id?: string;
  initial: PartnerSearchInput;
  lookups: ClientFormLookups;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => ({ ...initial, search: toSearchDraft(initial.search) }));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<PartnerSearchErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const input: PartnerSearchInput = { ...draft, search: fromSearchDraft(draft.search) };
  const errors: PartnerSearchErrors = { ...serverErrors, ...(submitted ? validatePartnerSearch(input) : {}) };
  const err = (key: keyof PartnerSearchErrors) => (errors[key] ? t.errors[errors[key]!] : undefined);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors({});
  }
  function setSearch<K extends keyof SearchDraft>(key: K, value: SearchDraft[K]) {
    setDraft((d) => ({ ...d, search: { ...d.search, [key]: value } }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailed(false);
    if (Object.keys(validatePartnerSearch(input)).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    const result = await savePartnerSearch(input, id);
    if (result.ok) {
      router.push("/partner-searches");
      return;
    }
    setSaving(false);
    setServerErrors(result.errors ?? {});
    setFailed(Boolean(result.message));
  }

  const text = (key: "brokerName" | "agency" | "phone" | "email", label: string, extra: { placeholder?: string; type?: string; required?: boolean; max: number }) => (
    <Field label={label} required={extra.required} error={err(key)}>
      {(props) => (
        <input
          {...props}
          type={extra.type ?? "text"}
          value={draft[key]}
          maxLength={extra.max}
          placeholder={extra.placeholder}
          onChange={(e) => set(key, e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {failed ? t.errors.generic : t.form.fixErrors}
        </div>
      )}

      <Card title={t.partnerSearches.sectionBroker}>
        <div className="grid gap-4 md:grid-cols-2">
          {text("brokerName", t.partnerSearches.broker, { placeholder: t.partnerSearches.brokerPlaceholder, required: true, max: PARTNER_LIMITS.name })}
          {text("agency", t.partnerSearches.agency, { max: PARTNER_LIMITS.name })}
          {text("phone", t.partnerSearches.phone, { type: "tel", placeholder: t.profile.phonePlaceholder, max: PARTNER_LIMITS.phone })}
          {text("email", t.partnerSearches.email, { type: "email", max: PARTNER_LIMITS.email })}
        </div>
      </Card>

      <Card title={t.partnerSearches.sectionSearch}>
        <SearchFields search={draft.search} onChange={setSearch} lookups={lookups} error={(key) => err(`search.${key}`)} />
      </Card>

      <Card title={t.partnerSearches.note}>
        <Field label={t.partnerSearches.note} required error={err("note")}>
          {(props) => (
            <NoteArea
              {...props}
              rows={4}
              maxLength={PARTNER_LIMITS.note}
              value={draft.note}
              placeholder={t.partnerSearches.notePlaceholder}
              onChange={(value) => set("note", value)}
            />
          )}
        </Field>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 sm:px-2">
          <Link href="/partner-searches" className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.common.saving : id ? t.partnerSearches.save : t.partnerSearches.create}
          </button>
        </div>
      </div>
    </form>
  );
}
