"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { sendInquiry, type InquiryError, type InquiryInput } from "@/app/w/[slug]/actions";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";

/** "Call me back": name, phone, a line — the broker gets it as a client straight away. */
export function InquiryForm({ slug, propertyId, agency, defaultMessage = "" }: { slug: string; propertyId: string | null; agency: string; defaultMessage?: string }) {
  const { t } = useI18n();
  const [form, setForm] = useState<InquiryInput>({ name: "", phone: "", email: "", message: defaultMessage, consent: false, website: "" });
  const [error, setError] = useState<InquiryError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof InquiryInput>(key: K, value: InquiryInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  if (done) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 px-5 py-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <p className="mt-2 text-lg font-bold">{t.site.thanksTitle}</p>
        <p className="mt-1 text-sm text-fg-2">{t.site.thanksText}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await sendInquiry(slug, propertyId, form);
          if (result.ok) setDone(true);
          else setError(result.error);
        });
      }}
      className="space-y-3"
    >
      <input required minLength={2} maxLength={120} autoComplete="name" placeholder={t.site.name} aria-label={t.site.name} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="tel" autoComplete="tel" maxLength={40} placeholder={t.site.phone} aria-label={t.site.phone} value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
        <input type="email" autoComplete="email" maxLength={200} placeholder={t.site.email} aria-label={t.site.email} value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
      </div>
      <textarea rows={3} maxLength={1000} placeholder={t.site.message} aria-label={t.site.message} value={form.message} onChange={(e) => set("message", e.target.value)} className={inputClass} />
      {/* robots fill in every field — people don't see this one */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => set("website", e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-xs text-fg-2">
        <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
        <span>{fmt(t.site.consent, { agency })}</span>
      </label>
      {error && <p className="text-sm font-medium text-danger">{t.site.errors[error]}</p>}
      <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t.site.send}
      </button>
    </form>
  );
}
