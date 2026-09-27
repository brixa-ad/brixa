"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { PROFILE_LIMITS, validateProfile, type ProfileErrors, type ProfileInput } from "@/lib/profile";
import { updateProfile } from "./actions";

export function ProfileForm({ initial }: { initial: ProfileInput }) {
  const { t } = useI18n();
  const [values, setValues] = useState(initial);
  const [areaDraft, setAreaDraft] = useState("");
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const errorText = (field: keyof ProfileInput) => (errors[field] ? t.errors[errors[field]!] : undefined);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  function addArea() {
    const area = areaDraft.trim().slice(0, PROFILE_LIMITS.area);
    if (!area || values.areas.length >= PROFILE_LIMITS.areas) return;
    if (!values.areas.some((a) => a.toLowerCase() === area.toLowerCase())) {
      set("areas", [...values.areas, area]);
    }
    setAreaDraft("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const localErrors = validateProfile(values);
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.ok) setStatus("saved");
      else {
        setErrors(result.errors ?? {});
        setStatus("failed");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.profile.fullName} required error={errorText("fullName")}>
          {(props) => (
            <input
              {...props}
              value={values.fullName}
              maxLength={PROFILE_LIMITS.fullName}
              autoComplete="name"
              onChange={(e) => set("fullName", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t.profile.jobTitle} error={errorText("jobTitle")}>
          {(props) => (
            <input
              {...props}
              value={values.jobTitle}
              maxLength={PROFILE_LIMITS.jobTitle}
              placeholder={t.profile.jobTitlePlaceholder}
              onChange={(e) => set("jobTitle", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t.profile.phone} error={errorText("phone")}>
          {(props) => (
            <input
              {...props}
              type="tel"
              value={values.phone}
              maxLength={PROFILE_LIMITS.phone}
              autoComplete="tel"
              placeholder={t.profile.phonePlaceholder}
              onChange={(e) => set("phone", e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>

      <Field label={t.profile.bio} error={errorText("bio")} hint={`${values.bio.length}/${PROFILE_LIMITS.bio}`}>
        {(props) => (
          <textarea
            {...props}
            rows={5}
            value={values.bio}
            maxLength={PROFILE_LIMITS.bio}
            placeholder={t.profile.bioPlaceholder}
            onChange={(e) => set("bio", e.target.value)}
            className={`${inputClass} resize-y`}
          />
        )}
      </Field>

      <Field label={t.profile.areas} error={errorText("areas")} hint={t.profile.areasHint}>
        {(props) => (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                {...props}
                value={areaDraft}
                maxLength={PROFILE_LIMITS.area}
                placeholder={t.profile.areasPlaceholder}
                onChange={(e) => setAreaDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addArea();
                  }
                }}
                className={inputClass}
              />
              <button
                type="button"
                onClick={addArea}
                disabled={!areaDraft.trim() || values.areas.length >= PROFILE_LIMITS.areas}
                className={buttonClass.secondary}
              >
                <Plus className="size-4" />
                {t.profile.addArea}
              </button>
            </div>
            {values.areas.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {values.areas.map((area) => (
                  <li
                    key={area}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-sm text-accent-fg"
                  >
                    {area}
                    <button
                      type="button"
                      aria-label={`${t.photos.remove} ${area}`}
                      onClick={() => set("areas", values.areas.filter((a) => a !== area))}
                      className="grid size-5 place-items-center rounded-full hover:bg-accent/20"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft pt-5">
        {status === "saved" && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.profile.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? t.common.saving : t.profile.save}
        </button>
      </div>
    </form>
  );
}
