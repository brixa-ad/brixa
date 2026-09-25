"use client";

import { useTransition } from "react";
import { setLanguage } from "@/app/actions";
import { LANGS } from "@/lib/i18n/dictionaries";
import { useI18n } from "./I18nProvider";

export function LanguageToggle() {
  const { lang } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs font-semibold"
      aria-busy={pending}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          // Setting a cookie in a Server Action re-renders the current page in the new language.
          onClick={() => code !== lang && startTransition(() => setLanguage(code))}
          aria-pressed={code === lang}
          className={`rounded-md px-2 py-1 uppercase transition ${
            code === lang ? "bg-fg text-canvas" : "text-muted hover:text-fg"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
