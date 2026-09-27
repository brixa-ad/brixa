/** Browser side of phone notifications (web push). */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport = "supported" | "ios-install" | "unsupported";

export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  // iPhone / iPad: push only exists once BRIXA is added to the Home Screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios-install" : "unsupported";
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

/** The VAPID public key as the bytes pushManager.subscribe() wants. */
function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function subscribe() {
  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}
