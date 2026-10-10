"use client";

import { useState, useTransition } from "react";
import { setMonthlyNews } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/I18nProvider";

/** A client's monthly market note: on or off. */
export function MonthlyNewsToggle({ clientId, on: initial }: { clientId: string; on: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          startTransition(async () => {
            const result = await setMonthlyNews(clientId, next);
            if (!result.ok) setOn(!next);
          });
        }}
        className="peer sr-only"
      />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-accent/35 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow after:transition peer-checked:after:translate-x-4" />
      <span>
        <span className="block text-sm font-medium text-fg">{t.news.monthlyToggle}</span>
        <span className="block text-xs text-muted">{t.news.monthlyHint}</span>
      </span>
    </label>
  );
}
