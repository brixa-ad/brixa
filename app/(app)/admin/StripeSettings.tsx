"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Copy, Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { saveStripeSecret } from "./actions";

/** Card payments: is Stripe's key set, is the webhook's secret saved — and where Stripe should send its events. */
export function StripeSettings({ keySet, webhookReady, endpoint }: { keySet: boolean; webhookReady: boolean; endpoint: string }) {
  const { t } = useI18n();
  const P = t.platform;
  const [secret, setSecret] = useState("");
  const [ready, setReady] = useState(webhookReady);
  const [state, setState] = useState<"idle" | "saved" | "bad">("idle");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

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
      <div>
        <p className="mb-1 font-medium text-fg-2">{P.stripeEndpoint}</p>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2 text-xs">{endpoint}</code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(endpoint);
                setCopied(true);
              } catch {}
            }}
            className={buttonClass.secondary}
            aria-label="Copy"
          >
            {copied ? <CheckCircle2 className="size-4 text-success" /> : <Copy className="size-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">{P.stripeEvents}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await saveStripeSecret(secret);
            setState(result.ok ? "saved" : "bad");
            if (result.ok) {
              setReady(Boolean(secret.trim()));
              setSecret("");
            }
          });
        }}
        className="space-y-2"
      >
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value);
            setState("idle");
          }}
          placeholder={P.stripeSecretPlaceholder}
          className={inputClass}
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending || !secret.trim()} className={buttonClass.primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {P.stripeSave}
          </button>
          {state === "saved" && <span className="text-success">{P.stripeSaved}</span>}
          {state === "bad" && <span className="text-danger">{P.stripeBad}</span>}
        </div>
      </form>
    </div>
  );
}
