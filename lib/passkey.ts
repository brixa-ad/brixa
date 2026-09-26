/** Browser helpers for passkeys (Face ID, Touch ID, Windows Hello, fingerprint). */
import { createClient } from "./supabase/client";

/** True when this device can create a passkey unlocked by face / fingerprint / PIN. */
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** The user closed the Face ID / Windows Hello prompt — not an error worth showing. */
export function isCancelled(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; code?: string; cause?: { name?: string } };
  return (
    e.name === "NotAllowedError" ||
    e.name === "AbortError" ||
    e.code === "ERROR_CEREMONY_ABORTED" ||
    e.cause?.name === "NotAllowedError" ||
    e.cause?.name === "AbortError"
  );
}

/** A readable name for the passkey list, e.g. "iPhone" or "Windows". */
export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Browser";
}

/**
 * Register a passkey for the signed-in user on this device and name it after the device.
 * Returns "ok", "cancelled" or the error.
 */
export async function enrollThisDevice(): Promise<"ok" | "cancelled" | Error> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) return isCancelled(error) ? "cancelled" : error;
  if (data?.id) {
    await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: deviceName() });
  }
  return "ok";
}

export type PasskeyProblem = "cancelled" | "disabled" | "wrongDomain" | "other";

/** Sort a passkey failure into something we can explain to the user. */
export function passkeyProblem(error: unknown): PasskeyProblem {
  if (isCancelled(error)) return "cancelled";
  const e = (error ?? {}) as { name?: string; code?: string; message?: string; cause?: { name?: string; message?: string } };
  const text = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
  if (
    e.code === "ERROR_INVALID_RP_ID" ||
    e.code === "ERROR_INVALID_DOMAIN" ||
    e.name === "SecurityError" ||
    e.cause?.name === "SecurityError" ||
    /rp ?id|relying party|origin/i.test(text)
  ) {
    return "wrongDomain";
  }
  if (/disabled|not enabled/i.test(text)) return "disabled";
  return "other";
}
