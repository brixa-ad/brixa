"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { SALE_CASES, type SaleCase } from "@/lib/sale-docs";

/** The city (one of the district cities, or another place) and the cases that add documents. */
export function SaleDocsFilters({ cities, city, cases }: { cities: string[]; city: string; cases: SaleCase[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (next: { city?: string; cases?: SaleCase[] }) => {
    const qs = new URLSearchParams(searchParams.toString());
    if (next.city !== undefined) qs.set("city", next.city);
    if (next.cases !== undefined) {
      if (next.cases.length) qs.set("cases", next.cases.join(","));
      else qs.delete("cases");
    }
    startTransition(() => router.replace(`${pathname}?${qs.toString()}`, { scroll: false }));
  };

  return (
    <div className={`space-y-4 ${pending ? "opacity-60" : ""}`}>
      <label className="block text-sm font-medium text-fg-2 sm:max-w-xs">
        {t.saleDocs.city}
        <select value={city} onChange={(e) => go({ city: e.target.value })} className={`${inputClass} mt-1.5`}>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="other">{t.saleDocs.otherCity}</option>
        </select>
      </label>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.saleDocs.casesTitle}</span>
        <div className="flex flex-wrap gap-1.5">
          {SALE_CASES.map((c) => {
            const on = cases.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => go({ cases: on ? cases.filter((x) => x !== c) : [...cases, c] })}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                }`}
              >
                {t.saleDocs.cases[c]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
