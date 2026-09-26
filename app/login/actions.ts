"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

export type AuthState = {
  error?: "invalidCredentials" | "genericError" | "invalidEmail" | "passwordHint";
  checkEmail?: boolean;
};

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const agencyName = String(formData.get("agencyName") ?? "").trim();

  if (!isValidEmail(email)) return { error: "invalidEmail" };
  if (password.length < 8) return { error: "passwordHint" };

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, agency_name: agencyName },
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
  await supabase.auth.signOut();
  redirect("/login");
}
