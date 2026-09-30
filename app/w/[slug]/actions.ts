"use server";

import { anonymous } from "@/lib/share";
import { SLUG } from "@/lib/site";

export type InquiryInput = { name: string; phone: string; email: string; message: string; consent: boolean; website: string };
const KNOWN = ["consent_required", "name_required", "contact_required", "site_closed", "too_many"] as const;
export type InquiryError = (typeof KNOWN)[number] | "generic";

/** "Call me back" from the website: the visitor becomes a client (no account needed). */
export async function sendInquiry(slug: string, propertyId: string | null, input: InquiryInput): Promise<{ ok: true } | { ok: false; error: InquiryError }> {
  if (!SLUG.test(slug.toLowerCase())) return { ok: false, error: "generic" };
  // a field people don't see: only robots fill it in
  if (input.website) return { ok: true };
  const { error } = await anonymous().rpc("site_inquiry", {
    site: slug.toLowerCase(),
    target_property: propertyId && /^[0-9a-f-]{36}$/i.test(propertyId) ? propertyId : null,
    visitor_name: String(input.name ?? "").slice(0, 120),
    visitor_phone: String(input.phone ?? "").slice(0, 40),
    visitor_email: String(input.email ?? "").slice(0, 200),
    message: String(input.message ?? "").slice(0, 1000),
    agreed: input.consent === true,
  });
  if (!error) return { ok: true };
  const known = KNOWN.find((code) => error.message.includes(code));
  if (!known) console.error("A website inquiry failed:", error.message);
  return { ok: false, error: known ?? "generic" };
}
