"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { createShare } from "@/app/(app)/properties/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { Modal, SendLink, linkUrl } from "./LinkDialog";

export type ShareClient = { id: string; full_name: string; phone: string | null; email: string | null };

/** "Share": a private link to the listing's page, ready to send by Viber, WhatsApp or email. */
export function ShareDialog({
  propertyId,
  title,
  clients,
}: {
  propertyId: string;
  title: string;
  clients: ShareClient[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const client = clients.find((c) => c.id === clientId) ?? null;

  function start() {
    setClientId(null);
    setUrl(null);
    setFailed(false);
    setOpen(true);
  }

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createShare(propertyId, clientId);
      if (result.ok) setUrl(linkUrl("listing", result.token));
      else setFailed(true);
    });
  }

  return (
    <>
      <button type="button" onClick={start} className={buttonClass.secondary}>
        <Share2 className="size-4" />
        {t.share.button}
      </button>

      {open && (
        <Modal title={t.share.title} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">{t.share.hint}</p>
          {!url ? (
            <>
              <label className="mb-1.5 block text-sm font-medium text-fg-2">{t.share.forClient}</label>
              <Combobox
                options={clients.map((c) => ({ value: c.id, label: c.full_name, hint: c.phone ?? c.email ?? undefined }))}
                value={clientId}
                onChange={setClientId}
                placeholder={t.share.noClient}
                emptyText={t.location.noMatches}
              />
              {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
              <button type="button" onClick={create} disabled={pending} className={`${buttonClass.primary} mt-5 w-full`}>
                {pending ? t.common.saving : t.share.create}
              </button>
            </>
          ) : (
            <SendLink
              url={url}
              subject={title}
              text={fmt(t.share.message, { title })}
              phone={client?.phone ?? null}
              email={client?.email ?? null}
            />
          )}
        </Modal>
      )}
    </>
  );
}
