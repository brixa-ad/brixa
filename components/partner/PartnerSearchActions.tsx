"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { deletePartnerSearch, setPartnerSearchActive } from "@/app/(app)/partner-searches/actions";
import { useI18n } from "@/components/I18nProvider";

/** Edit, close / reopen, delete — for whoever entered the search, or a manager. */
export function PartnerSearchActions({ id, active }: { id: string; active: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const icon = "grid size-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg disabled:opacity-50";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link href={`/partner-searches/${id}/edit`} title={t.common.edit} aria-label={t.common.edit} className={icon}>
        <Pencil className="size-4" />
      </Link>
      <button
        type="button"
        disabled={pending}
        title={active ? t.partnerSearches.close : t.partnerSearches.reopen}
        aria-label={active ? t.partnerSearches.close : t.partnerSearches.reopen}
        onClick={() => startTransition(async () => void (await setPartnerSearchActive(id, !active)))}
        className={icon}
      >
        {active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
      </button>
      <button
        type="button"
        disabled={pending}
        title={t.common.delete}
        aria-label={t.common.delete}
        onClick={() => {
          if (!window.confirm(t.partnerSearches.deleteConfirm)) return;
          startTransition(async () => void (await deletePartnerSearch(id)));
        }}
        className={`${icon} hover:text-danger`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
