"use client";

import { useOptimistic, useTransition } from "react";
import { setClientStage } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { CLIENT_STAGES } from "@/lib/options";

export function ClientStageSelect({ clientId, stage }: { clientId: string; stage: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(stage);

  return (
    <select
      aria-label={t.clients.stage}
      value={optimistic}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          setOptimistic(next);
          await setClientStage(clientId, next);
        });
      }}
      className={`${inputClass} w-auto font-medium`}
    >
      {CLIENT_STAGES.map((code) => (
        <option key={code} value={code}>
          {t.options.stage[code]}
        </option>
      ))}
    </select>
  );
}
