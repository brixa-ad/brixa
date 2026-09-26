"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { createClientRecord, updateClientRecord } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/I18nProvider";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import type { ClientFormLookups } from "@/lib/clients";
import {
  NOTES_MAX,
  isSeeking,
  validateClient,
  type ClientErrors,
  type ClientInput,
  type SearchInput,
} from "@/lib/client-validation";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import {
  CLIENT_CLASSES,
  CLIENT_SOURCES,
  CLIENT_STAGES,
  CLIENT_TYPES,
  CURRENCIES,
  type ClientClass,
  type ClientType,
  type Currency,
} from "@/lib/options";
import { MultiLocationPicker } from "./MultiLocationPicker";

type NumKey = "budgetMin" | "budgetMax" | "areaMin" | "areaMax" | "roomsMin" | "roomsMax";
type Draft = Omit<ClientInput, "search"> & {
  search: Omit<SearchInput, NumKey> & Record<NumKey, string>;
};

const NUM_KEYS: NumKey[] = ["budgetMin", "budgetMax", "areaMin", "areaMax", "roomsMin", "roomsMax"];

export const CLASS_STYLES: Record<ClientClass, string> = {
  A: "border-danger bg-danger/10 text-danger",
  B: "border-warning bg-warning/10 text-warning",
  C: "border-sky-500 bg-sky-500/10 text-sky-500",
};

function toDraft(input: ClientInput): Draft {
  const search = { ...input.search } as unknown as Draft["search"];
  for (const key of NUM_KEYS) search[key] = input.search[key] === null ? "" : String(input.search[key]);
  return { ...input, search };
}

function parse(value: string) {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
}

function toInput(draft: Draft): ClientInput {
  const search = { ...draft.search } as unknown as SearchInput;
  for (const key of NUM_KEYS) search[key] = parse(draft.search[key]);
  return { ...draft, search };
}

export function ClientForm({
  mode,
  clientId,
  initial,
  lookups,
  canAssignBroker,
}: {
  mode: "create" | "edit";
  clientId?: string;
  initial: ClientInput;
  lookups: ClientFormLookups;
  canAssignBroker: boolean;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ClientErrors>({});
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const input = toInput(draft);
  const errors: ClientErrors = { ...serverErrors, ...(submitted ? validateClient(input) : {}) };
  const err = (key: keyof ClientErrors) => (errors[key] ? t.errors[errors[key]!] : undefined);
  const seeking = isSeeking(draft.types);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors({});
    if (key === "phone") setDuplicateOf(null);
  }

  function setSearch<K extends keyof Draft["search"]>(key: K, value: Draft["search"][K]) {
    setDraft((d) => ({ ...d, search: { ...d.search, [key]: value } }));
  }

  function toggle<T extends string>(list: T[], value: T) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function toggleType(type: ClientType) {
    const types = toggle(draft.types, type);
    // Only a tenant → rentals; only buyers/investors → sales; a mix keeps the current choice.
    const renting = types.includes("tenant");
    const buying = types.includes("buyer") || types.includes("investor");
    setDraft((d) => ({
      ...d,
      types,
      search: {
        ...d.search,
        operation: renting && !buying ? "rent" : buying && !renting ? "sale" : d.search.operation,
      },
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailed(false);
    if (Object.keys(validateClient(input)).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setSaving(true);
    const result =
      mode === "create" ? await createClientRecord(input) : await updateClientRecord(clientId!, input);
    if (result.ok) {
      router.push(`/clients/${result.id}`);
      return;
    }
    setSaving(false);
    setServerErrors(result.errors ?? {});
    setDuplicateOf(result.duplicateOf ?? null);
    setFailed(Boolean(result.message));
  }

  const numInput = (key: NumKey, placeholder: string, decimal = true) => (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      value={draft.search[key]}
      placeholder={placeholder}
      aria-invalid={errors[`search.${key}`] ? true : undefined}
      aria-label={placeholder}
      onChange={(e) => {
        if (/^[\d\s]*([.,]\d{0,2})?$/.test(e.target.value)) setSearch(key, e.target.value);
      }}
      className={inputClass}
    />
  );

  const rangeError = (a: NumKey, b: NumKey) => err(`search.${a}`) ?? err(`search.${b}`);
  const cancelHref = mode === "create" ? "/clients" : `/clients/${clientId}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(duplicateOf || failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {duplicateOf
            ? fmt(t.clients.duplicatePhone, { name: duplicateOf })
            : failed
              ? t.errors.generic
              : t.form.fixErrors}
        </div>
      )}

      <Card title={t.clients.sectionContact}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t.clients.fullName} required error={err("fullName")}>
            {(props) => (
              <input
                {...props}
                value={draft.fullName}
                maxLength={120}
                placeholder={t.clients.fullNamePlaceholder}
                onChange={(e) => set("fullName", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label={t.clients.phone} error={err("phone") ?? (duplicateOf ? " " : undefined)}>
            {(props) => (
              <input
                {...props}
                type="tel"
                value={draft.phone}
                maxLength={40}
                placeholder={t.profile.phonePlaceholder}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label={t.clients.email} error={err("email")}>
            {(props) => (
              <input
                {...props}
                type="email"
                value={draft.email}
                maxLength={200}
                onChange={(e) => set("email", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card title={t.clients.sectionProfile}>
        <div className="space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">
              {t.clients.types} <span className="text-danger">*</span>
            </span>
            <div className="flex flex-wrap gap-2" role="group">
              {CLIENT_TYPES.map((type) => {
                const on = draft.types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-invalid={errors.types ? true : undefined}
                    onClick={() => toggleType(type)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                      on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                    }`}
                  >
                    {on && <Check className="size-3.5" />}
                    {t.options.clientType[type]}
                  </button>
                );
              })}
            </div>
            <p className={`mt-1.5 text-xs ${errors.types ? "font-medium text-danger" : "text-muted"}`}>
              {errors.types ? t.errors[errors.types] : t.clients.typesHint}
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.clientClass}</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {CLIENT_CLASSES.map((cls) => {
                const on = draft.clientClass === cls;
                return (
                  <button
                    key={cls}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("clientClass", cls)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-center transition ${
                      on ? CLASS_STYLES[cls] : "border-line text-muted hover:border-line-strong"
                    }`}
                  >
                    <span className="block text-lg font-bold leading-tight">{cls}</span>
                    <span className="block text-xs font-medium">{t.options.clientClass[cls]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t.clients.stage} error={err("stage")}>
              {(props) => (
                <select {...props} value={draft.stage} onChange={(e) => set("stage", e.target.value as Draft["stage"])} className={inputClass}>
                  {CLIENT_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {t.options.stage[stage]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t.clients.source} error={err("source")}>
              {(props) => (
                <select {...props} value={draft.source ?? ""} onChange={(e) => set("source", e.target.value || null)} className={inputClass}>
                  <option value="">{t.form.choose}</option>
                  {CLIENT_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {t.options.source[source]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t.clients.broker} error={err("brokerId")} hint={canAssignBroker ? undefined : t.form.brokerLocked}>
              {(props) => (
                <select
                  {...props}
                  value={draft.brokerId ?? ""}
                  disabled={!canAssignBroker}
                  onChange={(e) => set("brokerId", e.target.value)}
                  className={inputClass}
                >
                  {lookups.members.map((m) => (
                    <option key={m.profile_id} value={m.profile_id}>
                      {m.full_name || m.email}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>
      </Card>

      {seeking && (
        <Card title={t.clients.sectionSearch}>
          <div className="space-y-6">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchOperation}</span>
              <div className="inline-flex rounded-lg border border-line-strong bg-raised p-0.5" role="radiogroup">
                {(["sale", "rent"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    role="radio"
                    aria-checked={draft.search.operation === op}
                    onClick={() => setSearch("operation", op)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                      draft.search.operation === op ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
                    }`}
                  >
                    {t.options.searchOperation[op]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchSubtypes}</span>
              <div className="space-y-2">
                {lookups.categories.map((category) => {
                  const subs = lookups.subtypes.filter((s) => s.category_id === category.id);
                  return (
                    <div key={category.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-full text-xs font-semibold uppercase tracking-wide text-subtle sm:w-28">
                        {localName(category, lang)}
                      </span>
                      {subs.map((sub) => {
                        const on = draft.search.subtypeIds.includes(sub.id);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setSearch("subtypeIds", toggle(draft.search.subtypeIds, sub.id))}
                            className={`rounded-full border px-2.5 py-1 text-xs transition ${
                              on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                            }`}
                          >
                            {localName(sub, lang)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted">{t.clients.searchSubtypesHint}</p>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchLocations}</span>
              <MultiLocationPicker
                regions={lookups.regions}
                settlements={lookups.settlements}
                settlementIds={draft.search.settlementIds}
                neighborhoodIds={draft.search.neighborhoodIds}
                onChange={(next) => {
                  setSearch("settlementIds", next.settlementIds);
                  setSearch("neighborhoodIds", next.neighborhoodIds);
                }}
              />
              <p className="mt-1.5 text-xs text-muted">{t.clients.searchLocationsHint}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchBudget}</span>
                <div className="grid grid-cols-[1fr_1fr_84px] gap-2">
                  {numInput("budgetMin", t.clients.from)}
                  {numInput("budgetMax", t.clients.to)}
                  <select
                    aria-label={t.form.currency}
                    value={draft.search.currency}
                    onChange={(e) => setSearch("currency", e.target.value as Currency)}
                    className={inputClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {rangeError("budgetMin", "budgetMax") && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("budgetMin", "budgetMax")}</p>
                )}
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchArea}</span>
                <div className="grid grid-cols-2 gap-2">
                  {numInput("areaMin", t.clients.from)}
                  {numInput("areaMax", t.clients.to)}
                </div>
                {rangeError("areaMin", "areaMax") && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("areaMin", "areaMax")}</p>
                )}
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchRooms}</span>
                <div className="grid grid-cols-2 gap-2">
                  {numInput("roomsMin", t.clients.from, false)}
                  {numInput("roomsMax", t.clients.to, false)}
                </div>
                {rangeError("roomsMin", "roomsMax") && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{rangeError("roomsMin", "roomsMax")}</p>
                )}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.clients.searchFeatures}</span>
              <div className="flex flex-wrap gap-1.5">
                {lookups.features.map((feature) => {
                  const on = draft.search.featureIds.includes(feature.id);
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSearch("featureIds", toggle(draft.search.featureIds, feature.id))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                      }`}
                    >
                      {localName(feature, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title={t.clients.sectionNotes}>
        <Field label={t.clients.notes} error={err("notes")} hint={`${draft.notes.length}/${NOTES_MAX}`}>
          {(props) => (
            <textarea
              {...props}
              rows={5}
              maxLength={NOTES_MAX}
              value={draft.notes}
              placeholder={t.clients.notesPlaceholder}
              onChange={(e) => set("notes", e.target.value)}
              className={`${inputClass} resize-y`}
            />
          )}
        </Field>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 sm:px-2">
          <Link href={cancelHref} className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.common.saving : mode === "create" ? t.clients.createButton : t.clients.saveButton}
          </button>
        </div>
      </div>
    </form>
  );
}
