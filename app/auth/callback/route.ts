import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Target of the sign-up confirmation email link.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  // Token-hash links (custom email template) work in any browser.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return NextResponse.redirect(`${origin}${error ? "/login?error=callback" : "/properties"}`);
  }

  // Default PKCE links only sign in from the browser that signed up.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/properties`);

    // Supabase only issues a code after confirming the email, so the account is
    // confirmed — the link was just opened in another browser. Ask them to sign in.
    return NextResponse.redirect(`${origin}/login?notice=confirmed`);
  }

  return NextResponse.redirect(`${origin}/login?error=callback`);
}
