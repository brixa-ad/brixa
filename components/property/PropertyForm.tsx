"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, ImageIcon, Loader2 } from "lucide-react";
import { createProperty, updateProperty } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import { formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
import {
  CONDITIONS,
  CONSTRUCTION_TYPES,
  CURRENCIES,
  EXPOSURES,
  FURNISHINGS,
  HEATINGS,
  OPERATION_TYPES,
  type Currency,
} from "@/lib/options";
import { MAX_PHOTOS, uploadPhotos } from "@/lib/photos";
import { toInput, type PropertyFormValues } from "@/lib/property-form";
import { createClient } from "@/lib/supabase/client";
import type { FormLookups } from "@/lib/types";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  hasBuildingFields,
  validateProperty,
  type ErrorCode,
  type FieldErrors,
  type PropertyInput,
} from "@/lib/validation";
import { LocationPicker } from "./LocationPicker";
import { PhotoDropzone } from "./PhotoDropzone";
import { PhotoGrid } from "./PhotoGrid";

type QueuedPhoto = { key: string; file: File; url: string };

export function PropertyForm({
  mode,
  lookups,
  initialValues,
  propertyId,
  organizationId,
  userId,
  coverUrl,
  existingPhotoCount = 0,
}: {
  mode: "create" | "edit";
  lookups: FormLookups;
  initialValues: PropertyFormValues;
  propertyId?: string;
  organizationId: string;
  userId: string;
  coverUrl?: string | null;
  existingPhotoCount?: number;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();

  const [values, setValues] = useState(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [serverMessage, setServerMessage] = useState<ErrorCode | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "done">("idle");
  const [queued, setQueued] = useState<QueuedPhoto[]>([]);

  const category = lookups.categories.find((c) => c.id === values.categoryId);
  const subtypes = lookups.subtypes.filter((s) => s.category_id === values.categoryId);
  const subtype = lookups.subtypes.find((s) => s.id === values.subtypeId);
  const features = values.subtypeId ? (lookups.subtypeFeatures[values.subtypeId] ?? []) : [];
  const showBuilding = hasBuildingFields(category?.code);

  const input = toInput(values);
  const clientErrors = submitted ? validateProperty(input, category?.code) : {};
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };
  const errorText = (field: keyof PropertyInput) => {
    const code = errors[field];
    return code ? t.errors[code] : undefined;
  };

  function set<K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as keyof PropertyInput];
      return next;
    });
  }

  function changeCategory(categoryId: string) {
    setValues((current) => ({ ...current, categoryId, subtypeId: "", featureIds: [] }));
  }

  function changeSubtype(subtypeId: string) {
    const allowed = new Set((lookups.subtypeFeatures[subtypeId] ?? []).map((f) => f.id));
    setValues((current) => ({
      ...current,
      subtypeId,
      featureIds: current.featureIds.filter((id) => allowed.has(id)),
    }));
  }

  function toggleFeature(featureId: string) {
    set(
      "featureIds",
      values.featureIds.includes(featureId)
        ? values.featureIds.filter((id) => id !== featureId)
        : [...values.featureIds, featureId]
    );
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setServerMessage(null);

    const localErrors = validateProperty(input, category?.code);
    if (Object.keys(localErrors).length > 0) {
      focusFirstError();
      return;
    }

    setPhase("saving");
    const result =
      mode === "create" ? await createProperty(input) : await updateProperty(propertyId!, input);

    if (!result.ok) {
      setPhase("idle");
      setServerErrors(result.errors ?? {});
      setServerMessage(result.message ?? null);
      if (result.errors) focusFirstError();
      return;
    }

    let failedPhotos = 0;
    if (queued.length > 0) {
      setPhase("uploading");
      failedPhotos = await uploadPhotos(createClient(), {
        organizationId,
        propertyId: result.id,
        userId,
        files: queued.map((photo) => photo.file),
        startPosition: 0,
      });
    }

    setPhase("done");
    router.push(`/properties/${result.id}${failedPhotos > 0 ? "?photos=failed" : ""}`);
  }

  // ---- queued photos (create mode) ----
  function queuePhotos(files: File[]) {
    setQueued((current) => [
      ...current,
      ...files.map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ]);
  }

  function unqueuePhoto(key: string) {
    setQueued((current) => {
      const photo = current.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((p) => p.key !== key);
    });
  }

  function queuedToCover(key: string) {
    setQueued((current) => {
      const photo = current.find((p) => p.key === key);
      return photo ? [photo, ...current.filter((p) => p.key !== key)] : current;
    });
  }

  // ---- summary ----
  const settlement = lookups.settlements.find((s) => s.id === values.settlementId);
  const region = lookups.regions.find((r) => r.id === settlement?.region_id);
  const previewImage = queued[0]?.url ?? coverUrl ?? null;
  const pricePerSqm =
    input.price && input.area && input.area > 0 ? Math.round(input.price / input.area) : null;

  const busy = phase !== "idle";
  const hasErrors = Object.keys(errors).length > 0;
  const submitLabel =
    phase === "saving"
      ? t.common.saving
      : phase === "uploading"
        ? t.photos.uploading
        : mode === "create"
          ? t.form.createButton
          : t.form.saveButton;

  const cancelHref = mode === "create" ? "/properties" : `/properties/${propertyId}`;

  return (
    <form onSubmit={handleSubmit} noValidate className="pb-24 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {(serverMessage || (submitted && hasErrors)) && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {serverMessage ? t.errors[serverMessage] : t.form.fixErrors}
            </div>
          )}

          {/* ---------------- Basics ---------------- */}
          <Card title={t.form.sectionBasics} id="basics">
            <div className="space-y-5">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg-2">
                  {t.form.operation}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                  {OPERATION_TYPES.map((op) => (
                    <button
                      key={op}
                      type="button"
                      role="radio"
                      aria-checked={values.operationType === op}
                      onClick={() => set("operationType", op)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        values.operationType === op
                          ? "border-accent bg-accent-soft text-accent-fg ring-1 ring-accent"
                          : "border-line text-fg-2 hover:border-line-strong"
                      }`}
                    >
                      {t.options.operation[op]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.form.category} required error={errorText("categoryId")}>
                  {(props) => (
                    <select
                      {...props}
                      value={values.categoryId}
                      onChange={(e) => changeCategory(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">{t.form.chooseCategory}</option>
                      {lookups.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {localName(c, lang)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field label={t.form.subtype} required error={errorText("subtypeId")}>
                  {(props) => (
                    <select
                      {...props}
                      value={values.subtypeId}
                      onChange={(e) => changeSubtype(e.target.value)}
                      disabled={!values.categoryId}
                      className={inputClass}
                    >
                      <option value="">{t.form.chooseSubtype}</option>
                      {subtypes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {localName(s, lang)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>

              <Field
                label={t.form.title}
                required
                error={errorText("title")}
                hint={`${values.title.length}/${TITLE_MAX}`}
              >
                {(props) => (
                  <input
                    {...props}
                    value={values.title}
                    maxLength={TITLE_MAX}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder={t.form.titlePlaceholder}
                    className={inputClass}
                  />
                )}
              </Field>
            </div>
          </Card>

          {/* ---------------- Location ---------------- */}
          <Card title={t.form.sectionLocation} id="location">
            <LocationPicker
              regions={lookups.regions}
              settlements={lookups.settlements}
              settlementId={values.settlementId}
              neighborhoodId={values.neighborhoodId}
              address={values.address}
              onLocationChange={(next) => {
                set("settlementId", next.settlementId);
                set("neighborhoodId", next.neighborhoodId);
              }}
              onAddressChange={(value) => set("address", value)}
              errors={{
                settlementId: errorText("settlementId"),
                neighborhoodId: errorText("neighborhoodId"),
                address: errorText("address"),
              }}
            />
          </Card>

          {/* ---------------- Specs ---------------- */}
          <Card title={t.form.sectionSpecs} id="specs">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <NumberField label={t.form.area} value={values.area} onChange={(v) => set("area", v)} error={errorText("area")} decimal />
              {showBuilding && (
                <>
                  <NumberField label={t.form.rooms} value={values.rooms} onChange={(v) => set("rooms", v)} error={errorText("rooms")} />
                  <NumberField label={t.form.bedrooms} value={values.bedrooms} onChange={(v) => set("bedrooms", v)} error={errorText("bedrooms")} />
                  <NumberField label={t.form.floor} value={values.floor} onChange={(v) => set("floor", v)} error={errorText("floor")} allowNegative />
                  <NumberField label={t.form.totalFloors} value={values.totalFloors} onChange={(v) => set("totalFloors", v)} error={errorText("totalFloors")} />
                  <OptionSelect label={t.form.condition} value={values.condition} onChange={(v) => set("condition", v)} codes={CONDITIONS} labels={t.options.condition} error={errorText("condition")} />
                  <OptionSelect label={t.form.construction} value={values.constructionType} onChange={(v) => set("constructionType", v)} codes={CONSTRUCTION_TYPES} labels={t.options.construction} error={errorText("constructionType")} />
                  <OptionSelect label={t.form.exposure} value={values.exposure} onChange={(v) => set("exposure", v)} codes={EXPOSURES} labels={t.options.exposure} error={errorText("exposure")} />
                  <OptionSelect label={t.form.furnishing} value={values.furnishing} onChange={(v) => set("furnishing", v)} codes={FURNISHINGS} labels={t.options.furnishing} error={errorText("furnishing")} />
                  <OptionSelect label={t.form.heating} value={values.heating} onChange={(v) => set("heating", v)} codes={HEATINGS} labels={t.options.heating} error={errorText("heating")} />
                </>
              )}
            </div>
          </Card>

          {/* ---------------- Features ---------------- */}
          <Card title={t.form.sectionFeatures} id="features">
            {!values.subtypeId ? (
              <p className="text-sm text-muted">{t.form.chooseSubtypeFirst}</p>
            ) : features.length === 0 ? (
              <p className="text-sm text-muted">{t.form.noFeatures}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {features.map((feature) => {
                  const checked = values.featureIds.includes(feature.id);
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleFeature(feature.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                        checked
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line bg-surface text-fg-2 hover:border-line-strong"
                      }`}
                    >
                      {checked && <Check className="size-3.5" />}
                      {localName(feature, lang)}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ---------------- Photos (create only; edit page manages them separately) ---------------- */}
          {mode === "create" && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  {t.form.sectionPhotos}
                  <span className="text-sm font-normal text-subtle">
                    {queued.length}/{MAX_PHOTOS}
                  </span>
                </span>
              }
              id="photos"
            >
              <div className="space-y-4">
                <PhotoGrid
                  photos={queued.map((p) => ({ key: p.key, url: p.url }))}
                  onMakeCover={queuedToCover}
                  onRemove={unqueuePhoto}
                  disabled={busy}
                />
                <PhotoDropzone onFiles={queuePhotos} remaining={MAX_PHOTOS - queued.length} disabled={busy} />
              </div>
            </Card>
          )}

          {/* ---------------- Price ---------------- */}
          <Card title={t.form.sectionPrice} id="price">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <NumberField
                label={t.form.price}
                required={values.operationType === "sale" || values.operationType === "rent"}
                value={values.price}
                onChange={(v) => set("price", v)}
                error={errorText("price")}
                decimal
                hint={
                  pricePerSqm
                    ? `${t.form.pricePerSqm}: ${formatPrice(pricePerSqm, values.currency, lang)}`
                    : undefined
                }
              />
              <Field label={t.form.currency} error={errorText("currency")}>
                {(props) => (
                  <select
                    {...props}
                    value={values.currency}
                    onChange={(e) => set("currency", e.target.value as Currency)}
                    className={inputClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </Card>

          {/* ---------------- Contract & description ---------------- */}
          <Card title={t.form.sectionContract} id="contract">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.form.broker} error={errorText("brokerId")}>
                  {(props) => (
                    <select
                      {...props}
                      value={values.brokerId}
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

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 md:mt-6">
                  <input
                    type="checkbox"
                    checked={values.exclusiveContract}
                    onChange={(e) => set("exclusiveContract", e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-accent/35 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow after:transition peer-checked:after:translate-x-4" />
                  <span>
                    <span className="block text-sm font-medium text-fg">{t.form.exclusive}</span>
                    <span className="block text-xs text-muted">{t.form.exclusiveHint}</span>
                  </span>
                </label>
              </div>

              <Field
                label={t.form.description}
                error={errorText("description")}
                hint={`${values.description.length}/${DESCRIPTION_MAX}`}
              >
                {(props) => (
                  <textarea
                    {...props}
                    rows={7}
                    maxLength={DESCRIPTION_MAX}
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder={t.form.descriptionPlaceholder}
                    className={`${inputClass} resize-y`}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>

        {/* ---------------- Sidebar: live preview + save ---------------- */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
              <div className="grid aspect-[4/3] place-items-center bg-raised">
                {previewImage ? (
                  <img src={previewImage} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-8 text-faint" />
                )}
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
                  {t.form.summary}
                </p>
                <div>
                  <p className="line-clamp-2 font-semibold text-fg">
                    {values.title.trim() || t.form.untitled}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {[subtype && localName(subtype, lang), t.options.operation[values.operationType]]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {settlement && (
                    <p className="mt-0.5 text-sm text-muted">
                      {settlementLabel(settlement)}
                      {region ? `, ${t.location.regionPrefix} ${region.name}` : ""}
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-subtle">{t.form.price}</dt>
                    <dd className="font-semibold">
                      {formatPrice(input.price, values.currency, lang) ?? t.common.notSet}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">{t.form.pricePerSqm}</dt>
                    <dd className="font-semibold">
                      {formatPrice(pricePerSqm, values.currency, lang) ?? t.common.notSet}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">{t.form.area}</dt>
                    <dd className="font-semibold">
                      {formatNumber(input.area, lang, 2) ?? t.common.notSet}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">{t.form.photosCount}</dt>
                    <dd className="font-semibold">{existingPhotoCount + queued.length}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button type="submit" disabled={busy} className={buttonClass.primary}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {submitLabel}
              </button>
              <Link href={cancelHref} className={buttonClass.secondary}>
                {t.common.cancel}
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile / tablet save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
          <Link href={cancelHref} className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={busy} className={buttonClass.primary}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  decimal,
  allowNegative,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  decimal?: boolean;
  allowNegative?: boolean;
}) {
  const pattern = new RegExp(
    `^${allowNegative ? "-?" : ""}[\\d\\s]*${decimal ? "([.,]\\d{0,2})?" : ""}$`
  );

  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {(props) => (
        <input
          {...props}
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => {
            if (pattern.test(e.target.value)) onChange(e.target.value);
          }}
          className={inputClass}
        />
      )}
    </Field>
  );
}

function OptionSelect<T extends string>({
  label,
  value,
  onChange,
  codes,
  labels,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  codes: readonly T[];
  labels: Record<T, string>;
  error?: string;
}) {
  const { t } = useI18n();

  return (
    <Field label={label} error={error}>
      {(props) => (
        <select {...props} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{t.form.choose}</option>
          {codes.map((code) => (
            <option key={code} value={code}>
              {labels[code]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
