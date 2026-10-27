"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { connectStripe, testStripe } from "./actions";
import type { StripeCheck } from "@/lib/stripe";

/** Card payments: is Stripe's key set, is the webhook connected — one tap connects it — and do Stripe's events reach BRIXA. */
export function StripeSettings({ keySet, webhookReady, endpoint }: { keySet: boolean; webhookReady: boolean; endpoint: string }) {
  const { t } = useI18n();
  const P = t.platform;
  const [ready, setReady] = useState(webhookReady);
  const [check, setCheck] = useState<(StripeCheck & { applied?: Record<string, { name: string; card: boolean }> }) | null>(null);
  const [checking, startCheck] = useTransition();
  const [connected, setConnected] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [connecting, startConnect] = useTransition();

  const row = (label: string, ok: boolean) => (
    <li className="flex items-center justify-between gap-3">
      <span className="text-fg-2">{label}</span>
      <span className={`inline-flex items-center gap-1 font-medium ${ok ? "text-success" : "text-warning"}`}>
        {ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
        {ok ? P.stripeReady : P.stripeMissing}
      </span>
    </li>
  );

  return (
    <div className="space-y-4 text-sm">
      <ul className="space-y-2">
        {row(P.stripeKey, keySet)}
        {row(P.stripeWebhook, ready)}
      </ul>
      {keySet && (
        <div className="space-y-1.5 rounded-xl border border-accent/40 p-3">
          <p className="text-fg-2">{P.connectHint}</p>
          <button
            type="button"
            disabled={connecting}
            onClick={() =>
              startConnect(async () => {
                const result = await connectStripe(endpoint);
                setConnected(result);
                if (result.ok) {
                  setReady(true);
                  setCheck(null);
                }
              })
            }
            className={buttonClass.primary}
          >
            {connecting && <Loader2 className="size-4 animate-spin" />}
            {P.connect}
          </button>
          {connected && (
            <p className={connected.ok ? "text-success" : "text-danger"}>
              {connected.ok ? P.connected : `${P.connectFailed}${connected.reason ? ` ${connected.reason}` : ""}`}
            </p>
          )}
        </div>
      )}
      {keySet && (
        <div className="space-y-1">
          <button type="button" disabled={checking} onClick={() => startCheck(async () => setCheck(await testStripe(endpoint)))} className={buttonClass.secondary}>
            {checking && <Loader2 className="size-4 animate-spin" />}
            {P.stripeCheck}
          </button>
          {check && (
            <div className="space-y-2 rounded-xl border border-line bg-raised/40 p-3">
              <p className={check.ok ? "text-success" : "text-danger"}>
                {check.ok ? (check.live ? P.stripeLive : P.stripeTest) : `${t.billing.stripeSaid}: ${check.reason ?? "—"}`}
              </p>
              {check.endpoint && (
                <>
                  <p className={check.endpoint.found && check.endpoint.enabled ? "text-success" : "text-danger"}>
                    {check.endpoint.found ? (check.endpoint.enabled ? P.diagHookFound : P.diagHookOff) : P.diagHookMissing}
                  </p>
                  {!check.endpoint.found && check.endpoint.others.length > 0 && (
                    <p className="break-all text-xs text-muted">
                      {P.diagHookOthers} {check.endpoint.others.join(", ")}
                    </p>
                  )}
                  {check.endpoint.found && check.endpoint.missing.length > 0 && (
                    <p className="text-danger">
                      {P.diagHookEvents} {check.endpoint.missing.join(", ")}
                    </p>
                  )}
                </>
              )}
              {check.events && (
                <div>
                  <p className="font-medium text-fg-2">{P.diagEvents}</p>
                  {check.events.length === 0 ? (
                    <p className="text-muted">{P.diagNoEvents}</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs">
                      {check.events.map((e) => {
                        const org = e.org ? check.applied?.[e.org] : undefined;
                        return (
                          <li key={e.id} className="flex flex-wrap gap-x-2">
                            <span className="text-muted">{new Date(e.at * 1000).toLocaleString("bg-BG", { timeZone: "Europe/Sofia" })}</span>
                            <code>{e.type}</code>
                            <span className={e.delivered ? "text-success" : "text-danger"}>
                              {e.delivered ? P.diagDelivered : e.beforeHook ? P.diagBeforeHook : P.diagNotDelivered}
                            </span>
                            {org && <span className="text-muted">· {org.name}{org.card ? ` · ${P.diagApplied}` : ` · ${P.diagNotApplied}`}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {check.endpoint?.found && check.events.some((e) => !e.delivered && !e.beforeHook) && <p className="mt-2 text-danger">{P.diagSecretHint}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
