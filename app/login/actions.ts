"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

export type AuthState = {
  error?: "invalidCredentials" | "genericError" | "invalidEmail" | "passwordHint" | "invalidEik" | "agencyRequired" | "termsRequired";
  checkEmail?: boolean;
};

/**
 * Sign up as an agency (its details become the agency's and its first office's) or as a broker
 * on their own. Someone with a pending invitation joins the inviting agency either way.
 */
export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);
  const email = text("email", 200);
  const password = String(formData.get("password") ?? "");
  const account = formData.get("accountType") === "solo" ? "solo" : "agency";
  const fullName = text("fullName", 120);
  const agencyName = account === "agency" ? text("agencyName", 120) : "";
  const eik = account === "agency" ? text("eik", 40).replace(/\D/g, "") : "";
  const rawWebsite = account === "agency" ? text("website", 200) : "";
  const website = rawWebsite && !/^https?:\/\//i.test(rawWebsite) ? `https://${rawWebsite}` : rawWebsite;

  if (!isValidEmail(email)) return { error: "invalidEmail" };
  if (password.length < 8) return { error: "passwordHint" };
  if (account === "agency" && !agencyName) return { error: "agencyRequired" };
  if (eik && !/^\d{9}(\d{4})?$/.test(eik)) return { error: "invalidEik" };
  if (formData.get("acceptTerms") !== "yes") return { error: "termsRequired" };

  const metadata: Record<string, string> = { account_type: account, full_name: fullName, phone: text("phone", 40), accepted_terms: "yes" };
  if (account === "agency") {
    Object.assign(metadata, {
      agency_name: agencyName,
      legal_name: text("legalName", 200),
      eik,
      city: text("city", 80),
      address: text("address", 200),
      agency_phone: text("agencyPhone", 40),
      website,
    });
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("Sign-up failed:", error.message);
    return { error: "genericError" };
  }

  // Email confirmation turned off in Supabase → we already have a session.
  if (data.session) redirect("/");

  return { checkEmail: true };
}

export async function signOut() {
  const supabase = await createClient();
  // only this device (the phone, the computer and the others stay signed in)
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
