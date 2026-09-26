"use client";

import { useEffect, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { enrollThisDevice, passkeyProblem, passkeySupported } from "@/lib/passkey";
import { createClient } from "@/lib/supabase/client";

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

  if (!visible) return null;

  function later() {
    writeDismissed();
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await enrollThisDevice();
    setBusy(false);
    if (result === "ok") later();
    else if (result !== "cancelled") {
      setError(
        passkeyProblem(result) === "wrongDomain"
          ? fmt(t.passkey.wrongDomain, { host: location.host })
          : fmt(t.passkey.failedDetail, { detail: result.message })
      );
    }
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
        <button type="button" onClick={enable} disabled={busy} className={buttonClass.primary}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? t.passkey.adding : t.passkey.promptEnable}
        </button>
        <button type="button" onClick={later} className={buttonClass.ghost}>
          {t.passkey.promptLater}
        </button>
      </div>
    </div>
  );
}
