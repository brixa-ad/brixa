"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { CLIENT_CLASSES, CLIENT_STAGES, CLIENT_TYPES } from "@/lib/options";

export function ClientFilters({ brokers }: { brokers: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const hasFilters = ["q", "stage", "class", "type", "broker"].some((key) => searchParams.get(key));
  const selectClass = `${inputClass} sm:w-auto`;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            clearTimeout(debounce.current);
            const value = event.target.value.trim();
            debounce.current = setTimeout(() => update("q", value), 300);
          }}
          placeholder={t.clients.search}
          aria-label={t.clients.search}
          className={`${inputClass} pl-9`}
        />
      </div>

      <select aria-label={t.clients.stage} value={searchParams.get("stage") ?? ""} onChange={(e) => update("stage", e.target.value)} className={selectClass}>
        <option value="">{t.clients.allStages}</option>
        {CLIENT_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {t.options.stage[stage]}
          </option>
        ))}
      </select>

      <select aria-label={t.clients.clientClass} value={searchParams.get("class") ?? ""} onChange={(e) => update("class", e.target.value)} className={selectClass}>
        <option value="">{t.clients.allClasses}</option>
        {CLIENT_CLASSES.map((cls) => (
          <option key={cls} value={cls}>
            {cls} — {t.options.clientClass[cls]}
          </option>
        ))}
      </select>

      <select aria-label={t.clients.types} value={searchParams.get("type") ?? ""} onChange={(e) => update("type", e.target.value)} className={selectClass}>
        <option value="">{t.clients.allTypes}</option>
        {CLIENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {t.options.clientType[type]}
          </option>
        ))}
      </select>

      {brokers.length > 1 && (
        <select aria-label={t.clients.broker} value={searchParams.get("broker") ?? ""} onChange={(e) => update("broker", e.target.value)} className={selectClass}>
          <option value="">{t.list.allBrokers}</option>
          {brokers.map((broker) => (
            <option key={broker.id} value={broker.id}>
              {broker.name}
            </option>
          ))}
        </select>
      )}

      {pending && <Loader2 className="size-4 animate-spin text-accent-fg" />}

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted hover:text-fg"
        >
          <X className="size-4" />
          {t.list.clearFilters}
        </button>
      )}
    </div>
  );
}
