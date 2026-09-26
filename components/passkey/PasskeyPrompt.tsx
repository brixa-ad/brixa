"use client";

import { useEffect, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { completeRegistration, passkeySupported, prepareRegistration, worksHere } from "@/lib/passkey";
import { createClient } from "@/lib/supabase/client";
import { passkeyMessage } from "./messages";
import { usePrepared } from "./usePrepared";

const DISMISSED_KEY = "brixa.passkeyPrompt.dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // private mode — the banner will just come back next time
  }
}

/**
 * One-time suggestion after signing in with a password:
 * shown when this device supports passkeys and the user has none yet.
 */
export function PasskeyPrompt() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ready, take, refresh, rpId } = usePrepared(prepareRegistration, visible);

  useEffect(() => {
    if (readDismissed()) return;
    let ignore = false;

    (async () => {
      if (!(await passkeySupported())) return;
      const { data, error: listError } = await createClient().auth.passkey.list();
      // If passkeys aren't enabled on the server yet, stay quiet.
      if (!ignore && !listError && data && data.length === 0) setVisible(true);
    })();

    return () => {
      ignore = true;
    };
  }, []);

  if (!visible || !worksHere(rpId)) return null;

  function later() {
    writeDismissed();
    setVisible(false);
  }

  async function enable() {
    const prepared = take();
    if (!prepared) return;
    setBusy(true);
    setError(null);

    // Opens Face ID right away — no network wait before it (Safari requirement).
    const result = await completeRegistration(prepared);
    setBusy(false);
    if (result === "ok") {
      later();
      return;
    }
    void refresh();
    setError(
      passkeyMessage(result, t, fmt(t.passkey.failedDetail, { detail: result === "cancelled" ? "" : result.message }))
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
        <ScanFace className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold">{t.passkey.promptTitle}</p>
        <p className="text-sm text-fg-2">{error ?? t.passkey.promptText}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={enable} disabled={busy || !ready} className={buttonClass.primary}>
          {(busy || !ready) && <Loader2 className="size-4 animate-spin" />}
          {busy ? t.passkey.adding : t.passkey.promptEnable}
        </button>
        <button type="button" onClick={later} className={buttonClass.ghost}>
          {t.passkey.promptLater}
        </button>
      </div>
    </div>
  );
}
