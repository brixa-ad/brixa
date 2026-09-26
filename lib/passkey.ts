/**
 * Browser helpers for passkeys (Face ID, Touch ID, Windows Hello, fingerprint).
 *
 * Safari only shows the Face ID prompt when it opens straight from a tap. Supabase's
 * one-call helpers fetch a challenge first, and that network wait makes iPhones refuse.
 * So we fetch the challenge ahead of time ("prepare") and, on tap, open the prompt
 * immediately ("complete").
 */
import {
  deserializeCredentialCreationOptions,
  deserializeCredentialRequestOptions,
  serializeCredentialCreationResponse,
  serializeCredentialRequestResponse,
} from "@supabase/auth-js/dist/module/lib/webauthn";
import { createClient } from "./supabase/client";

/** Challenges are valid for 5 minutes; refresh a little before that. */
export const PREPARE_REFRESH_MS = 4 * 60 * 1000;

/** A fetched challenge, plus the site address (RP ID) passkeys are set up for. */
export type Prepared<T> = { challengeId: string; publicKey: T; rpId: string | null };
export type PreparedRegistration = Prepared<PublicKeyCredentialCreationOptions>;
export type PreparedSignIn = Prepared<PublicKeyCredentialRequestOptions>;

/** True when this device can create a passkey unlocked by face / fingerprint / PIN. */
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** The Face ID / Windows Hello prompt was closed or not confirmed. */
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

type Outcome = "ok" | "cancelled" | Error;

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

// ---------------------------------------------------------------------------
// Adding a device (user is signed in)
// ---------------------------------------------------------------------------

export async function prepareRegistration(): Promise<PreparedRegistration | null> {
  const { data, error } = await createClient().auth.passkey.startRegistration();
  if (error || !data) {
    console.error("Preparing passkey registration failed:", error);
    return null;
  }
  const publicKey = deserializeCredentialCreationOptions(data.options) as unknown as PublicKeyCredentialCreationOptions;
  return { challengeId: data.challenge_id, publicKey, rpId: publicKey.rp?.id ?? null };
}

/** Call directly from the tap handler — the prompt must open before any other await. */
export async function completeRegistration(prepared: PreparedRegistration): Promise<Outcome> {
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({ publicKey: prepared.publicKey })) as PublicKeyCredential | null;
  } catch (e) {
    return isCancelled(e) ? "cancelled" : asError(e);
  }
  if (!credential) return "cancelled";

  const supabase = createClient();
  const { data, error } = await supabase.auth.passkey.verifyRegistration({
    challengeId: prepared.challengeId,
    credential: serializeCredentialCreationResponse(credential as never),
  });
  if (error) return error;
  if (data?.id) await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: deviceName() });
  return "ok";
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

export async function prepareSignIn(): Promise<PreparedSignIn | null> {
  const { data, error } = await createClient().auth.passkey.startAuthentication();
  if (error || !data) {
    console.error("Preparing passkey sign-in failed:", error);
    return null;
  }
  const publicKey = deserializeCredentialRequestOptions(data.options) as unknown as PublicKeyCredentialRequestOptions;
  return { challengeId: data.challenge_id, publicKey, rpId: publicKey.rpId ?? null };
}

/** Call directly from the tap handler. On success the session is saved (cookies). */
export async function completeSignIn(prepared: PreparedSignIn): Promise<Outcome> {
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({ publicKey: prepared.publicKey })) as PublicKeyCredential | null;
  } catch (e) {
    return isCancelled(e) ? "cancelled" : asError(e);
  }
  if (!credential) return "cancelled";

  const { error } = await createClient().auth.passkey.verifyAuthentication({
    challengeId: prepared.challengeId,
    credential: serializeCredentialRequestResponse(credential as never),
  });
  return error ?? "ok";
}

/** Passkeys only work on the site address they were set up for (the RP ID) or its subdomains. */
export function worksHere(rpId: string | null | undefined) {
  if (!rpId) return true;
  const host = location.hostname;
  return host === rpId || host.endsWith(`.${rpId}`);
}
