"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, Save } from "lucide-react";
import { saveSite } from "@/app/(app)/settings/actions";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/ui/Modal";
import { buttonClass, inputClass } from "@/components/ui/form";

/** Managers: turn the website on, pick its address, write the headline and a few words about the agency. */
export function SiteSettingsForm({ initial }: { initial: { enabled: boolean; slug: string; headline: string; about: string } }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [slug, setSlug] = useState(initial.slug);
  const [headline, setHeadline] = useState(initial.headline);
  const [about, setAbout] = useState(initial.about);
  const [state, setState] = useState<"idle" | "ok" | "taken" | "invalid" | "error">("idle");
  const [savedSlug, setSavedSlug] = useState(initial.enabled ? initial.slug : "");
  const [pending, startTransition] = useTransition();
  const origin = mounted ? window.location.origin : "";

  function save() {
    setState("idle");
    startTransition(async () => {
      const result = await saveSite({ enabled, slug, headline, about });
      if (result.ok) {
        setState("ok");
        setSavedSlug(enabled ? slug.trim().toLowerCase() : "");
      } else setState(result.reason ?? "error");
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5 accent-accent" />
        {t.site.enabled}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.site.address}</span>
        <div className="flex items-center gap-1 rounded-lg border border-line-strong bg-raised pl-3 text-sm">
          <span className="shrink-0 text-subtle">/w/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40))}
            placeholder="moyata-agencia"
            className="min-w-0 flex-1 bg-transparent py-2 pr-3 outline-none"
          />
        </div>
        <span className="mt-1 block text-[11px] text-subtle">{t.site.addressHint}</span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.site.headline}</span>
        <input maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={t.site.headlinePlaceholder} className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.site.about}</span>
        <textarea rows={4} maxLength={2000} value={about} onChange={(e) => setAbout(e.target.value)} placeholder={t.site.aboutPlaceholder} className={inputClass} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t.common.save}
        </button>
        {savedSlug && (
          <a href={`/w/${savedSlug}`} target="_blank" rel="noreferrer" className={buttonClass.secondary}>
            <ExternalLink className="size-4" />
            {t.site.open}
          </a>
        )}
        {state === "ok" && <Check className="size-5 text-success" />}
        {state === "taken" && <span className="text-sm font-medium text-danger">{t.site.taken}</span>}
        {state === "invalid" && <span className="text-sm font-medium text-danger">{t.site.invalid}</span>}
        {state === "error" && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
      </div>
      {savedSlug && origin && <p className="break-all text-xs text-muted">{`${origin}/w/${savedSlug}`}</p>}
    </div>
  );
}
