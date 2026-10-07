"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { createClientRecord, updateClientRecord } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import type { ClientFormLookups } from "@/lib/clients";
import {
  NOTES_MAX,
  isOffering,
  isSeeking,
  validateClient,
  type ClientErrors,
  type ClientInput,
  type SearchInput,
} from "@/lib/client-validation";
import { parseEgn } from "@/lib/egn";
import { fmt } from "@/lib/i18n/dictionaries";
import {
  CLIENT_CLASSES,
  CLIENT_SOURCES,
  CLIENT_STAGES,
  CLIENT_TYPES,
  type ClientClass,
  type ClientType,
} from "@/lib/options";
import { CLASS_ICONS } from "./ClassBadge";
import { OfferFields, type OfferDraft } from "./OfferFields";
import { SearchFields } from "./SearchFields";

type NumKey = "budgetMin" | "budgetMax" | "areaMin" | "areaMax" | "roomsMin" | "roomsMax";
type Draft = Omit<ClientInput, "search" | "offer"> & {
  search: Omit<SearchInput, NumKey> & Record<NumKey, string>;
  offer: OfferDraft;
};

const text = (n: number | null) => (n === null ? "" : String(n));

const NUM_KEYS: NumKey[] = ["budgetMin", "budgetMax", "areaMin", "areaMax", "roomsMin", "roomsMax"];

export const CLASS_STYLES: Record<ClientClass, string> = {
  A: "border-danger bg-danger/10 text-danger",
  B: "border-warning bg-warning/10 text-warning",
  C: "border-sky-500 bg-sky-500/10 text-sky-500",
};

function toDraft(input: ClientInput): Draft {
  const search = { ...input.search } as unknown as Draft["search"];
  for (const key of NUM_KEYS) search[key] = input.search[key] === null ? "" : String(input.search[key]);
  const offer: OfferDraft = { ...input.offer, area: text(input.offer.area), rooms: text(input.offer.rooms), price: text(input.offer.price) };
  return { ...input, search, offer };
}

function parse(value: string) {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
}

function toInput(draft: Draft): ClientInput {
  const search = { ...draft.search } as unknown as SearchInput;
  for (const key of NUM_KEYS) search[key] = parse(draft.search[key]);
  const offer = { ...draft.offer, area: parse(draft.offer.area), rooms: parse(draft.offer.rooms), price: parse(draft.offer.price) };
  return { ...draft, search, offer };
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
  // a valid ЕГН shows the birthday it holds (and fills it in)
  const born = parseEgn(draft.egn);
  const egnHint = born
    ? fmt(t.clients.egnBorn, {
        date: new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(Date.UTC(born.year, born.month - 1, born.day))
        ),
      })
    : t.clients.identityHint;
  const seeking = isSeeking(draft.types);
  const offering = isOffering(draft.types);
  const offerTitle =
    draft.types.includes("seller") && draft.types.includes("landlord")
      ? t.clients.sectionOfferBoth
      : draft.types.includes("landlord")
        ? t.clients.sectionOfferRent
        : t.clients.sectionOffer;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors({});
    if (key === "phone") setDuplicateOf(null);
  }

  function setSearch<K extends keyof Draft["search"]>(key: K, value: Draft["search"][K]) {
    setDraft((d) => ({ ...d, search: { ...d.search, [key]: value } }));
  }

  function setOffer<K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) {
    setDraft((d) => ({ ...d, offer: { ...d.offer, [key]: value } }));
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

  const cancelHref = mode === "create" ? "/clients" : `/clients/${clientId}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(duplicateOf || failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {duplicateOf
            ? duplicateOf === "#free"
              ? t.followUp.duplicateFree
              : fmt(t.clients.duplicatePhone, { name: duplicateOf })
            : failed
              ? t.errors.generic
              : t.form.fixErrors}
        </div>
      )}

      <Card title={t.clients.sectionContact}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                const Icon = CLASS_ICONS[cls];
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
                    <span className="flex items-center justify-center gap-1.5 text-lg font-bold leading-tight">
                      <Icon className="size-4" aria-hidden />
                      {cls}
                    </span>
                    <span className="block text-xs font-medium">{t.options.clientClass[cls]}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t.signals.classFormHint}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  {canAssignBroker && <option value="free">{t.followUp.freeOption}</option>}
                </select>
              )}
            </Field>
          </div>

          <Field label={t.programs.birthdayLabel} hint={t.programs.birthdayHint} error={err("birthDay")}>
            {(props) => (
              <div className="flex gap-2">
                <select
                  {...props}
                  value={draft.birthDay ?? ""}
                  onChange={(e) => set("birthDay", e.target.value ? Number(e.target.value) : null)}
                  className={`${inputClass} w-24`}
                  aria-label={t.programs.dayPlaceholder}
                >
                  <option value="">{t.programs.dayPlaceholder}</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.birthMonth ?? ""}
                  onChange={(e) => set("birthMonth", e.target.value ? Number(e.target.value) : null)}
                  className={`${inputClass} min-w-0 flex-1`}
                  aria-label={t.programs.monthPlaceholder}
                >
                  <option value="">{t.programs.monthPlaceholder}</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "bg-BG", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 15)))}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.clients.egn} error={err("egn")} hint={egnHint}>
              {(props) => (
                <input
                  {...props}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  value={draft.egn}
                  onChange={(e) => {
                    const egn = e.target.value.replace(/\D/g, "").slice(0, 10);
                    const born = parseEgn(egn);
                    setDraft((d) => ({ ...d, egn, ...(born ? { birthDay: born.day, birthMonth: born.month } : {}) }));
                  }}
                  className={`${inputClass} tabular-nums`}
                />
              )}
            </Field>
            <Field label={t.clients.idCard} error={err("idCard")}>
              {(props) => (
                <input
                  {...props}
                  autoComplete="off"
                  maxLength={20}
                  value={draft.idCard}
                  onChange={(e) => set("idCard", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                  className={`${inputClass} tabular-nums`}
                />
              )}
            </Field>
          </div>

          {draft.source === "referral" && (
            <Field
              label={t.clients.referrer}
              error={err("referrer")}
            >
              {(props) => (
                <input
                  {...props}
                  value={draft.referrer}
                  maxLength={120}
                  placeholder={t.clients.referrerPlaceholder}
                  onChange={(e) => set("referrer", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          )}
        </div>
      </Card>

      {seeking && (
        <Card title={t.clients.sectionSearch}>
          <SearchFields search={draft.search} onChange={setSearch} lookups={lookups} error={(key) => err(`search.${key}`)} />
        </Card>
      )}

      {offering && (
        <Card title={offerTitle} description={t.clients.offerHint}>
          <OfferFields
            offer={draft.offer}
            onChange={setOffer}
            categories={lookups.categories}
            subtypes={lookups.subtypes}
            settlements={lookups.settlements}
            error={(key) => err(`offer.${key}`)}
          />
        </Card>
      )}

      <Card title={t.clients.sectionNotes}>
        <Field label={t.clients.notes} required error={err("notes")} hint={`${draft.notes.length}/${NOTES_MAX}`}>
          {(props) => (
            <NoteArea
              {...props}
              rows={5}
              maxLength={NOTES_MAX}
              value={draft.notes}
              placeholder={t.clients.notesPlaceholder}
              onChange={(value) => set("notes", value)}
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
