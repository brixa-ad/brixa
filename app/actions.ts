"use server";

import { cookies } from "next/headers";
import { LANG_COOKIE, isLang } from "@/lib/i18n/dictionaries";

export async function setLanguage(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
