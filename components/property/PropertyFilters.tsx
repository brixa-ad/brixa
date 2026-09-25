"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { OPERATION_TYPES, STATUSES } from "@/lib/options";

export function PropertyFilters({
  categories,
  brokers,
}: {
  categories: { id: string; name: string }[];
  /** only passed for managers */
  brokers: { id: string; name: string }[];
}) {
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

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => update("q", value.trim()), 300);
  }

  const hasFilters = ["q", "op", "status", "cat", "broker"].some((key) => searchParams.get(key));
  const selectClass = `${inputClass} sm:w-auto`;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={q}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t.list.search}
          aria-label={t.list.search}
          className={`${inputClass} pl-9`}
        />
      </div>

      <select
        aria-label={t.form.operation}
        value={searchParams.get("op") ?? ""}
        onChange={(event) => update("op", event.target.value)}
        className={selectClass}
      >
        <option value="">{t.list.allOperations}</option>
        {OPERATION_TYPES.map((code) => (
          <option key={code} value={code}>
            {t.options.operation[code]}
          </option>
        ))}
      </select>

      <select
        aria-label={t.detail.status}
        value={searchParams.get("status") ?? ""}
        onChange={(event) => update("status", event.target.value)}
        className={selectClass}
      >
        <option value="">{t.list.allStatuses}</option>
        {STATUSES.map((code) => (
          <option key={code} value={code}>
            {t.options.status[code]}
          </option>
        ))}
      </select>

      <select
        aria-label={t.form.category}
        value={searchParams.get("cat") ?? ""}
        onChange={(event) => update("cat", event.target.value)}
        className={selectClass}
      >
        <option value="">{t.list.allCategories}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      {brokers.length > 0 && (
        <select
          aria-label={t.form.broker}
          value={searchParams.get("broker") ?? ""}
          onChange={(event) => update("broker", event.target.value)}
          className={selectClass}
        >
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
