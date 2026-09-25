"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

const I18nContext = createContext<{ lang: Lang; t: Dictionary } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ lang, t: dictionaries[lang] }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
