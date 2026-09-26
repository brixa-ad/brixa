"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Card, buttonClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { completeRegistration, passkeySupported, prepareRegistration, worksHere } from "@/lib/passkey";
import { createClient } from "@/lib/supabase/client";
import { passkeyMessage } from "./messages";
import { usePrepared } from "./usePrepared";

type PasskeyRow = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

async function fetchPasskeys(): Promise<PasskeyRow[]> {
  const { data, error } = await createClient().auth.passkey.list();
  if (error) console.error("Listing passkeys failed:", error);
  return data ?? [];
}

/** "Passwordless sign-in" card on the profile page. */
export function PasskeyManager() {
  const { t, lang } = useI18n();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const { ready, take, refresh, rpId } = usePrepared(prepareRegistration, supported === true);

  useEffect(() => {
    let ignore = false;
    passkeySupported().then((ok) => !ignore && setSupported(ok));
    fetchPasskeys().then((rows) => !ignore && setPasskeys(rows));
    return () => {
      ignore = true;
    };
  }, []);

  const reload = async () => setPasskeys(await fetchPasskeys());

  async function add() {
    const prepared = take();
    if (!prepared) return;
    setBusy(true);
    setMessage(null);

    // Opens Face ID right away — no network wait before it (Safari requirement).
    const result = await completeRegistration(prepared);
    if (result === "ok") {
      setMessage({ kind: "ok", text: t.passkey.added });
    } else {
      if (result !== "cancelled") console.error("Passkey registration failed:", result);
      setMessage({
        kind: "error",
        text: passkeyMessage(result, t, fmt(t.passkey.failedDetail, { detail: result === "cancelled" ? "" : result.message })),
      });
    }
    await Promise.all([reload(), refresh()]);
    setBusy(false);
  }

  async function remove(passkey: PasskeyRow) {
    const name = passkey.friendly_name || t.passkey.sectionTitle;
    if (!window.confirm(fmt(t.passkey.removeConfirm, { name }))) return;
    setBusy(true);
    const { error } = await createClient().auth.passkey.delete({ passkeyId: passkey.id });
    if (error) setMessage({ kind: "error", text: t.errors.generic });
    await reload();
    setBusy(false);
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Fingerprint className="size-4.5 text-accent-fg" />
          {t.passkey.sectionTitle}
        </span>
      }
      description={t.passkey.sectionHint}
    >
      <div className="space-y-4">
        <p className="text-xs text-subtle">{t.passkey.perDevice}</p>

        {passkeys === null ? (
          <Loader2 className="size-5 animate-spin text-subtle" />
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted">{t.passkey.none}</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-xl border border-line">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Fingerprint className="size-5 shrink-0 text-accent-fg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.friendly_name || "Passkey"}</p>
                  <p className="text-xs text-muted">
                    {fmt(t.passkey.createdOn, { date: formatDate(p.created_at, lang) })}
                    {p.last_used_at && ` · ${fmt(t.passkey.lastUsed, { date: formatDate(p.last_used_at, lang) })}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(p)}
                  title={t.passkey.remove}
                  aria-label={t.passkey.remove}
                  className="grid size-9 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {supported === false ? (
          <p className="text-sm text-muted">{t.passkey.notSupported}</p>
        ) : !worksHere(rpId) ? (
          <p className="text-sm text-muted">
            {fmt(t.passkey.onlyOn, { host: rpId! })}{" "}
            <a href={`https://${rpId}/profile`} className="font-semibold text-accent-fg hover:underline">
              {t.passkey.openThere}
            </a>
          </p>
        ) : (
          <button type="button" onClick={add} disabled={busy || !ready} className={buttonClass.primary}>
            {busy || !ready ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {busy ? t.passkey.adding : t.passkey.addDevice}
          </button>
        )}

        {message && (
          <p
            role="status"
            className={`flex items-start gap-2 text-sm font-medium ${message.kind === "ok" ? "text-success" : "text-danger"}`}
          >
            {message.kind === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
