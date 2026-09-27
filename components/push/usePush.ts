"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/(app)/settings/actions";
import { VAPID_PUBLIC_KEY, currentSubscription, pushSupport, subscribe } from "@/lib/push-client";

export type PushStatus = "loading" | "unsupported" | "ios-install" | "not-ready" | "denied" | "off" | "on";

/** Whether this device gets phone notifications, and turning them on / off. */
export function usePush() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const support = pushSupport();
      if (support !== "supported") return setStatus(support);
      if (!VAPID_PUBLIC_KEY) return setStatus("not-ready");
      if (Notification.permission === "denied") return setStatus("denied");
      const subscription = await currentSubscription().catch(() => null);
      setStatus(subscription && Notification.permission === "granted" ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      // Ask first, straight from the tap — iPhone only shows the prompt then.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const subscription = await subscribe();
      const json = subscription.toJSON();
      const result = await savePushSubscription(
        { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } },
        navigator.userAgent
      );
      if (!result.ok) throw new Error("save failed");
      setStatus("on");
    } catch (error) {
      console.error("Turning on push failed:", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setFailed(false);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, failed, enable, disable };
}
