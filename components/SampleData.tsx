"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Sparkles } from "lucide-react";
import { loadSampleData, removeSampleData } from "@/app/(app)/sample-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

/** In a new agency's first steps: look around BRIXA with made-up data. */
export function SampleOffer() {
  const { t } = useI18n();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line-strong p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-brand-cyan" />
        {t.sample.offerTitle}
      </p>
      <p className="mt-1 text-sm text-muted">{t.sample.offerText}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await loadSampleData();
            if (result.ok) router.refresh();
            else setFailed(true);
          })
        }
        className={`${buttonClass.secondary} mt-3`}
      >
        {pending ? t.common.loading : t.sample.load}
      </button>
      {failed && <p className="mt-2 text-sm text-danger">{t.errors.generic}</p>}
    </div>
  );
}

/** While the made-up data is in: say so, and take it away in one tap (asking once). */
export function SampleBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-2 text-sm print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FlaskConical className="size-4 shrink-0 text-brand-cyan" />
        <span className="min-w-0 flex-1">{asking ? t.sample.removeConfirm : t.sample.bannerShort}</span>
        {asking ? (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeSampleData();
                  if (result.ok) {
                    setAsking(false);
                    router.refresh();
                  } else setFailed(true);
                })
              }
              className={buttonClass.danger}
            >
              {pending ? t.common.loading : t.sample.remove}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={buttonClass.ghost}>
              {t.common.cancel}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setAsking(true)} className="shrink-0 font-semibold text-accent-fg hover:text-fg">
            {t.sample.removeShort}
          </button>
        )}
      </div>
      {failed && <p className="mt-2 text-danger">{t.errors.generic}</p>}
    </div>
  );
}
