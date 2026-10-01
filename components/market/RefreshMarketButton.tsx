"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { refreshMarketToday } from "@/app/(app)/market/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

/** Managers: work today's numbers out again now (they're worked out every morning anyway). */
export function RefreshMarketButton() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshMarketToday();
          setDone(result.ok);
        })
      }
      className={`${buttonClass.secondary} px-3! py-1.5!`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : done ? <Check className="size-4" /> : <RefreshCw className="size-4" />}
      {done ? t.market.refreshed : t.market.refresh}
    </button>
  );
}
