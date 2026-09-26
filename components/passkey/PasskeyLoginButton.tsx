"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { passkeyProblem, passkeySupported } from "@/lib/passkey";
import { createClient } from "@/lib/supabase/client";

/** "Sign in with Face ID" — shown only on devices that support passkeys. */
export function PasskeyLoginButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    passkeySupported().then(setSupported);
  }, []);

  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPasskey();
    if (!signInError) {
      router.replace("/properties");
      router.refresh();
      return;
    }
    setBusy(false);
    const problem = passkeyProblem(signInError);
    if (problem === "cancelled") return;
    console.error("Passkey sign-in failed:", signInError);
    setError(
      problem === "wrongDomain"
        ? fmt(t.passkey.wrongDomain, { host: location.host })
        : problem === "disabled"
          ? t.passkey.notEnabled
          : t.passkey.failed
    );
  }

  return (
    <div className="mb-4 space-y-3">
      <button type="button" onClick={signIn} disabled={busy} className={`${buttonClass.primary} w-full py-3`}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ScanFace className="size-5" />}
        <span className="text-left leading-tight">
          <span className="block">{t.passkey.signIn}</span>
          <span className="block text-xs font-normal opacity-80">{t.passkey.signInHint}</span>
        </span>
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="flex items-center gap-3 text-xs text-subtle before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        {t.passkey.or}
      </p>
    </div>
  );
}
