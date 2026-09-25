"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProperty } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

export function DeletePropertyButton({ propertyId }: { propertyId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.detail.deleteConfirm)) return;
        startTransition(async () => {
          const result = await deleteProperty(propertyId);
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
