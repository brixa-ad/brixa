"use client";

import { useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { cancelOpenHouse } from "@/app/(app)/open-houses/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

export function CancelOpenHouse({ id }: { id: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.openHouses.cancelConfirm)) return;
        startTransition(async () => {
          const result = await cancelOpenHouse(id);
          if (!result.ok) window.alert(t.errors.generic);
        });
      }}
      className={buttonClass.danger}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
      {t.openHouses.cancel}
    </button>
  );
}
