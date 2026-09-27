"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

/** Installs the service worker as soon as the app opens (it shows the push notifications). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) registerServiceWorker().catch(() => {});
  }, []);
  return null;
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
