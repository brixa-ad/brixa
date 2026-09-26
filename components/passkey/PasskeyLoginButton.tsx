"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { completeSignIn, passkeyProblem, passkeySupported, prepareSignIn, worksHere } from "@/lib/passkey";
import { passkeyMessage } from "./messages";
import { usePrepared } from "./usePrepared";

/** "Sign in with Face ID" — shown only on devices that support passkeys. */
export function PasskeyLoginButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ready, take, refresh, rpId } = usePrepared(prepareSignIn, supported);

  useEffect(() => {
    passkeySupported().then(setSupported);
  }, []);

  // Hidden where it can't work (other devices, or a site address passkeys aren't set up for).
  if (!supported || !worksHere(rpId)) return null;

  async function signIn() {
    const prepared = take();
    if (!prepared) return;
    setBusy(true);
    setError(null);

    // Opens Face ID right away — no network wait before it (Safari requirement).
    const result = await completeSignIn(prepared);
    if (result === "ok") {
      router.replace("/properties");
      router.refresh();
      return;
    }

    setBusy(false);
    void refresh();
    if (passkeyProblem(result) !== "cancelled") console.error("Passkey sign-in failed:", result);
    setError(passkeyMessage(result, t, t.passkey.failed));
  }

  return (
    <div className="mb-4 space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={busy || !ready}
        className={`${buttonClass.primary} w-full py-3`}
      >
        {busy || !ready ? <Loader2 className="size-5 animate-spin" /> : <ScanFace className="size-5" />}
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
