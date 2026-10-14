"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { openBillingPortal, setAutoRenew } from "@/app/(app)/subscription/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

/** The card subscription's buttons: Stripe's page for the card and the invoices, and renewing on or off in one tap. */
export function BillingActions({ autoRenew, failing }: { autoRenew: boolean; failing: boolean }) {
  const { t } = useI18n();
  const B = t.billing;
  const [renew, setRenew] = useState(autoRenew);
  const [busy, setBusy] = useState<"portal" | "renew" | null>(null);
  const [failed, setFailed] = useState<string | false>(false);
  const [, startTransition] = useTransition();

  function portal() {
    setFailed(false);
    setBusy("portal");
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result.url) window.location.assign(result.url);
      else {
        setBusy(null);
        setFailed(result.reason ? `${B.stripeSaid}: ${result.reason}` : t.errors.generic);
      }
    });
  }

  function toggle() {
    if (renew && !window.confirm(B.renewOffConfirm)) return;
    setFailed(false);
    setBusy("renew");
    startTransition(async () => {
      const result = await setAutoRenew(!renew);
      setBusy(null);
      if (result.ok) setRenew(!renew);
      else setFailed(t.errors.generic);
    });
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={portal} disabled={busy !== null} className={failing ? buttonClass.primary : buttonClass.secondary}>
          {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          {failing ? B.changeCard : B.manage}
        </button>
        <button type="button" onClick={toggle} disabled={busy !== null} className={renew ? buttonClass.secondary : buttonClass.primary}>
          {busy === "renew" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {renew ? B.renewOff : B.renewOn}
        </button>
      </div>
      {!renew && <p className="text-sm text-muted">{B.renewOffNote}</p>}
      {failed && <p className="text-sm text-danger">{failed}</p>}
    </div>
  );
}
