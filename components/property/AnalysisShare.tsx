"use client";

import { useState, useTransition } from "react";
import { Eye, Send } from "lucide-react";
import { createAnalysisShare, stopAnalysisShare } from "@/app/(app)/properties/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { buttonClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { Modal, SendLink, linkUrl } from "./LinkDialog";
import type { ShareClient } from "./ShareDialog";

/** "Send to the owner" / "Send to a buyer": a link to the analysis page, ready for Viber, WhatsApp or e-mail. */
export function AnalysisSendButton({
  propertyId,
  title,
  audience,
  clients,
  defaultClientId,
  primary = false,
}: {
  propertyId: string;
  title: string;
  audience: "owner" | "buyer";
  clients: ShareClient[];
  defaultClientId?: string | null;
  primary?: boolean;
}) {
  const { t } = useI18n();
  const R = t.rating;
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const client = clients.find((c) => c.id === clientId) ?? null;

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createAnalysisShare(propertyId, audience, clientId);
      if (result.ok) setUrl(linkUrl("analysis", result.token));
      else setFailed(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUrl(null);
          setFailed(false);
          setClientId(defaultClientId ?? null);
          setOpen(true);
        }}
        className={primary ? buttonClass.primary : buttonClass.secondary}
      >
        <Send className="size-4" />
        {audience === "owner" ? R.sendOwner : R.sendBuyer}
      </button>
      {open && (
        <Modal title={audience === "owner" ? R.sendTitleOwner : R.sendTitleBuyer} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">{R.sendHint}</p>
          {!url ? (
            <>
              <label className="mb-1.5 block text-sm font-medium text-fg-2">{R.forClient}</label>
              <Combobox
                options={clients.map((c) => ({ value: c.id, label: c.full_name, hint: c.phone ?? c.email ?? undefined }))}
                value={clientId}
                onChange={setClientId}
                placeholder={R.noClient}
                emptyText={t.location.noMatches}
              />
              {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
              <button type="button" onClick={create} disabled={pending} className={`${buttonClass.primary} mt-5 w-full`}>
                {pending ? t.common.saving : R.create}
              </button>
            </>
          ) : (
            <SendLink url={url} subject={title} text={fmt(R.message, { title })} phone={client?.phone ?? null} email={client?.email ?? null} />
          )}
        </Modal>
      )}
    </>
  );
}

export type AnalysisShareRow = {
  id: string;
  audience: "owner" | "buyer";
  client: string | null;
  views: number;
  lastViewedAt: string | null;
  createdAt: string;
  revoked: boolean;
};

/** The analyses sent so far: to whom, opened how many times, and stopping one. */
export function AnalysisShareList({ rows }: { rows: AnalysisShareRow[] }) {
  const { t, lang } = useI18n();
  const R = t.rating;
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-fg-2">{R.sentTitle}</h4>
      <ul className="mt-2 divide-y divide-line-soft text-sm">
        {rows.map((r) => (
          <li key={r.id} className={`flex items-center gap-3 py-2 ${r.revoked ? "opacity-50" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {r.audience === "owner" ? R.sendTitleOwner : R.sendTitleBuyer}
                {r.client && <span className="font-normal text-muted"> · {r.client}</span>}
              </span>
              <span className="block text-xs text-muted">
                {formatDate(r.createdAt, lang)} ·{" "}
                {r.views > 0 ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Eye className="size-3" />
                    {fmt(R.opened, { n: r.views })}
                    {r.lastViewedAt && ` · ${formatDate(r.lastViewedAt, lang, true)}`}
                  </span>
                ) : (
                  R.notOpened
                )}
              </span>
            </span>
            {!r.revoked && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => void (await stopAnalysisShare(r.id)))}
                className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-50"
              >
                {R.stop}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
