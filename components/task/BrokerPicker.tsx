"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";

/** Managers: whose tasks to look at — mine, one colleague, or everyone. */
export function BrokerPicker({
  value,
  members,
  selfId,
}: {
  value: string;
  members: { id: string; name: string }[];
  selfId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={t.tasks.filterBroker}
      value={value}
      disabled={pending}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString());
        if (event.target.value === selfId) next.delete("broker");
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
      <option value="all">{t.tasks.allBrokers}</option>
    </select>
  );
}
