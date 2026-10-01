"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";

/** Search the colleagues by name, agency or phone. */
export function PartnerSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  return (
    <div className="relative rounded-2xl border border-line bg-surface p-3 shadow-xs">
      <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          clearTimeout(debounce.current);
          const value = event.target.value.trim();
          debounce.current = setTimeout(() => startTransition(() => router.replace(value ? `${pathname}?q=${encodeURIComponent(value)}` : pathname, { scroll: false })), 300);
        }}
        placeholder={t.partners.search}
        aria-label={t.partners.search}
        className={`${inputClass} pl-9`}
      />
      {pending && <Loader2 className="absolute right-6 top-1/2 size-4 -translate-y-1/2 animate-spin text-accent-fg" />}
    </div>
  );
}
