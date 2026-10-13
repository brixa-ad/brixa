"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { acceptTerms } from "@/app/(app)/settings/actions";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

/** For the agency's owner: the terms changed (or were never accepted in this version) — read them and accept. */
export function TermsBanner({ date }: { date: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (done) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm sm:flex-row sm:items-center print:hidden">
      <FileCheck2 className="hidden size-5 shrink-0 text-accent-fg sm:block" />
      <p className="min-w-0 flex-1 text-fg-2">
        {fmt(t.legal.bannerText, { date })}{" "}
        <Link href="/terms" target="_blank" className="font-medium text-accent-fg underline-offset-2 hover:underline">
          {t.legal.terms}
        </Link>
        {" · "}
        <Link href="/dpa" target="_blank" className="font-medium text-accent-fg underline-offset-2 hover:underline">
          {t.legal.dpa}
        </Link>
        {failed && <span className="ml-2 font-medium text-danger">{t.errors.generic}</span>}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptTerms();
            if (result.ok) setDone(true);
            else setFailed(true);
          })
        }
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t.legal.accept}
      </button>
    </div>
  );
}
