"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setExpectedRent } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";

/** The broker's own figure for the monthly rent (empty: BRIXA's estimate). */
export function RentEditor({ propertyId, initial }: { propertyId: string; initial: number | null }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function save(rent: number | null) {
    setStatus("idle");
    startTransition(async () => {
      const result = await setExpectedRent(propertyId, rent);
      setStatus(result.ok ? "saved" : "failed");
      if (result.ok && rent === null) setValue("");
    });
  }

  const typed = value.trim() === "" ? null : Number(value.replace(/\s/g, "").replace(",", "."));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(typed);
      }}
      className="mt-5 border-t border-line-soft pt-4"
    >
      <label htmlFor="expected-rent" className="block text-sm font-medium text-fg-2">
        {t.yield.yourRent}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id="expected-rent"
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            if (/^[\d\s.,]{0,9}$/.test(event.target.value)) setValue(event.target.value);
            setStatus("idle");
          }}
          placeholder="650"
          className={`${inputClass} w-32`}
        />
        <button type="submit" disabled={pending || (typed !== null && !(typed > 0))} className={buttonClass.secondary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t.common.save}
        </button>
        {initial !== null && (
          <button type="button" disabled={pending} onClick={() => save(null)} className="text-sm font-medium text-muted hover:text-danger">
            {t.yield.clear}
          </button>
        )}
        {status === "saved" && <Check className="size-4 text-success" aria-label={t.agency.saved} />}
        {status === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
      </div>
      <p className="mt-1 text-xs text-subtle">{t.yield.yourRentHint}</p>
    </form>
  );
}
