"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { signInVisitor, type SignInError, type SignInInput } from "@/app/o/[token]/actions";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";

const KINDS = ["buyer", "neighbor", "curious", "agent"] as const;

/** The form at the door: who you are, what you think of the price, how you like the home. */
export function VisitorSignIn({ token, agency, broker }: { token: string; agency: string; broker: string }) {
  const { t } = useI18n();
  const [form, setForm] = useState<SignInInput>({
    name: "",
    phone: "",
    email: "",
    kind: "buyer",
    opinion: null,
    rating: null,
    liked: "",
    lookingFor: "",
    consent: false,
  });
  const [error, setError] = useState<SignInError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SignInInput>(key: K, value: SignInInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const chip = (active: boolean) =>
    `rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${active ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-fg-2"}`;

  if (done) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <p className="mt-3 text-xl font-bold">{t.openHouses.thanksTitle}</p>
        <p className="mt-1 text-fg-2">{fmt(t.openHouses.thanksText, { broker })}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await signInVisitor(token, form);
          if (result.ok) setDone(true);
          else setError(result.error);
        });
      }}
      className="space-y-5"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{t.openHouses.name} *</span>
        <input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.openHouses.phone} *</span>
          <input type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.openHouses.email}</span>
          <input type="email" autoComplete="email" maxLength={200} value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.openHouses.iAm}</legend>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((kind) => (
            <button key={kind} type="button" onClick={() => set("kind", kind)} aria-pressed={form.kind === kind} className={chip(form.kind === kind)}>
              {t.openHouses.kindsPublic[kind]}
            </button>
          ))}
        </div>
      </fieldset>

      {form.kind === "buyer" && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.openHouses.lookingForQuestion}</span>
          <input maxLength={500} value={form.lookingFor} onChange={(e) => set("lookingFor", e.target.value)} placeholder={t.openHouses.lookingPlaceholder} className={inputClass} />
        </label>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.openHouses.priceQuestion}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["low", "right", "high"] as const).map((key) => (
            <button key={key} type="button" onClick={() => set("opinion", form.opinion === key ? null : key)} aria-pressed={form.opinion === key} className={chip(form.opinion === key)}>
              {t.openHouses.price[key]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.openHouses.ratingQuestion}</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => set("rating", n)} aria-label={String(n)} aria-pressed={form.rating === n} className="p-1">
              <Star className={`size-8 ${form.rating !== null && n <= form.rating ? "fill-warning text-warning" : "text-faint"}`} />
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{t.openHouses.likedQuestion}</span>
        <input maxLength={500} value={form.liked} onChange={(e) => set("liked", e.target.value)} className={inputClass} />
      </label>

      <label className="flex items-start gap-3 rounded-xl bg-raised/60 p-3 text-sm">
        <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
        <span>{fmt(t.openHouses.consent, { agency })}</span>
      </label>

      {error && <p className="text-sm font-medium text-danger">{t.openHouses.signErrors[error]}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-on-accent disabled:opacity-60"
      >
        {pending && <Loader2 className="size-5 animate-spin" />}
        {t.openHouses.submit}
      </button>
    </form>
  );
}
