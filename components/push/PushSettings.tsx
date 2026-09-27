"use client";

import { useState, useTransition } from "react";
import { BellOff, BellRing, CheckCircle2, Loader2, Send } from "lucide-react";
import { sendTestPush } from "@/app/(app)/settings/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { usePush } from "./usePush";

/** Settings card: turn phone notifications on/off for this device, and send a test. */
export function PushSettings() {
  const { t } = useI18n();
  const { status, busy, failed, enable, disable } = usePush();
  const [testing, startTest] = useTransition();
  const [testSent, setTestSent] = useState(false);

  const note = {
    unsupported: t.push.unsupported,
    "ios-install": t.push.iosInstall,
    "not-ready": t.push.notReady,
    denied: t.push.denied,
  } as const;

  return (
    <div className="space-y-4">
      {status === "loading" ? (
        <Loader2 className="size-5 animate-spin text-muted" />
      ) : status in note ? (
        <p className="rounded-lg bg-raised px-3 py-2.5 text-sm text-fg-2">{note[status as keyof typeof note]}</p>
      ) : status === "on" ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.push.on}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={testing}
              onClick={() =>
                startTest(async () => {
                  const result = await sendTestPush();
                  setTestSent(result.ok);
                })
              }
              className={buttonClass.primary}
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t.push.test}
            </button>
            <button type="button" disabled={busy} onClick={disable} className={buttonClass.secondary}>
              <BellOff className="size-4" />
              {t.push.disable}
            </button>
          </div>
          {testSent && <p className="text-xs text-muted">{t.push.testSent}</p>}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t.push.off}</p>
          <button type="button" disabled={busy} onClick={enable} className={`${buttonClass.primary} w-full sm:w-auto`}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            {t.push.enable}
          </button>
        </>
      )}
      {failed && <p className="text-sm font-medium text-danger">{t.push.failed}</p>}
    </div>
  );
}
