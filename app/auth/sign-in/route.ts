import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email + password sign-in as a plain form POST followed by a full page redirect.
 * Password managers (iCloud Keychain, Google, Edge…) only offer "Save password"
 * reliably when a real form submission navigates the page like this.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const origin = request.nextUrl.origin;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const reason = error.status === 400 ? "invalidCredentials" : "genericError";
    // 303: the browser follows with a GET, so a refresh won't re-send the password.
    return NextResponse.redirect(`${origin}/login?error=${reason}`, 303);
  }

  return NextResponse.redirect(`${origin}/properties`, 303);
}
