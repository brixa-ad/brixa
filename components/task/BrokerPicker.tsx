"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";

/** Managers: whose tasks / deals to look at — mine, one colleague, or everyone. */
export function BrokerPicker({
  value,
  members,
  selfId,
  allByDefault = false,
  allowAll = true,
}: {
  value: string;
  members: { id: string; name: string }[];
  selfId: string;
  /** the page shows everyone when there is no ?broker= */
  allByDefault?: boolean;
  /** offer "everyone" (not on pages that show one person, like the calendar) */
  allowAll?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // alone: there's no one else to look at
  if (members.length <= 1) return null;

  return (
    <select
      aria-label={t.tasks.filterBroker}
      value={value}
      disabled={pending}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString());
        if (event.target.value === (allByDefault ? "all" : selfId)) next.delete("broker");
        else next.set("broker", event.target.value);
        const qs = next.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
      }}
      className={`${inputClass} w-auto`}
    >
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      {allowAll && <option value="all">{t.tasks.allBrokers}</option>}
    </select>
  );
}
