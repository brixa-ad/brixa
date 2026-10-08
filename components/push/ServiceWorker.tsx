"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

/** Installs the service worker as soon as the app opens (it shows the push notifications). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) registerServiceWorker().catch(() => {});
    // the app open: no number left on its icon (it said there was something new)
    const clear = () => {
      if (document.visibilityState !== "visible") return;
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      nav.clearAppBadge?.().catch(() => {});
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  return null;
}

/** A conversation read: its notifications leave the phone's list too. */
export function closeChatNotifications(room: string) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration("/")
    .then((registration) => registration?.getNotifications({ tag: `/chat/${room}` }))
    .then((shown) => shown?.forEach((n) => n.close()))
    .catch(() => {});
}

/** On the sign-in page: a signed-out device stops getting the last user's notifications. */
export function StopPushAfterSignOut() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => subscription?.unsubscribe())
      .catch(() => {});
  }, []);
  return null;
}
