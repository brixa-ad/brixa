"use client";

import { useOptimistic, useTransition } from "react";
import { setPropertyStatus } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { STATUSES } from "@/lib/options";

export function StatusSelect({ propertyId, status }: { propertyId: string; status: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);

  return (
    <select
      aria-label={t.detail.status}
      value={optimistic}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          setOptimistic(next);
          await setPropertyStatus(propertyId, next);
        });
      }}
      className={`${inputClass} w-auto font-medium`}
    >
      {STATUSES.map((code) => (
        <option key={code} value={code}>
          {t.options.status[code]}
        </option>
      ))}
    </select>
  );
}
