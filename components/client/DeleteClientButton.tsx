"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteClientRecord } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

export function DeleteClientButton({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.clients.deleteConfirm)) return;
        startTransition(async () => {
          const result = await deleteClientRecord(clientId);
          if (result && !result.ok) window.alert(t.errors.generic);
        });
      }}
      className={buttonClass.danger}
    >
      <Trash2 className="size-4" />
      {pending ? t.common.deleting : t.common.delete}
    </button>
  );
}
