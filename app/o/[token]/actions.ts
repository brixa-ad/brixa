"use server";

import { anonymous, UUID } from "@/lib/share";

export type SignInInput = {
  name: string;
  phone: string;
  email: string;
  kind: string;
  opinion: string | null;
  rating: number | null;
  liked: string;
  lookingFor: string;
  consent: boolean;
};

const KNOWN = ["consent_required", "name_required", "contact_required", "open_house_closed"] as const;
export type SignInError = (typeof KNOWN)[number] | "generic";

/** A visitor signs in at the door (no account — the QR code's token is the key). */
export async function signInVisitor(token: string, input: SignInInput): Promise<{ ok: true } | { ok: false; error: SignInError }> {
  if (!UUID.test(token)) return { ok: false, error: "generic" };
  const { error } = await anonymous().rpc("open_house_sign_in", {
    house_token: token,
    visitor_name: String(input.name ?? "").slice(0, 120),
    visitor_phone: String(input.phone ?? "").slice(0, 40),
    visitor_email: String(input.email ?? "").slice(0, 200),
    visitor_kind: input.kind,
    opinion: input.opinion,
    stars: input.rating,
    liked_most: String(input.liked ?? "").slice(0, 500),
    wants: String(input.lookingFor ?? "").slice(0, 500),
    agreed: input.consent === true,
  });
  if (!error) return { ok: true };
  const known = KNOWN.find((code) => error.message.includes(code));
  if (!known) console.error("Open house sign-in failed:", error.message);
  return { ok: false, error: known ?? "generic" };
}
