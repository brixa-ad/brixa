"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { shareWithPartner, type PartnerPick } from "@/app/(app)/partners/actions";
import { useI18n } from "@/components/I18nProvider";
import { SendLink, linkUrl } from "@/components/property/LinkDialog";
import { buttonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { fmt } from "@/lib/i18n/dictionaries";
import { PartnerPicker, type PartnerOption } from "./PartnerPicker";

/** "Share with a colleague": a link of their own to the listing — then send it by Viber, WhatsApp, e-mail. */
export function ShareWithColleague({ propertyId, title, partners }: { propertyId: string; title: string; partners: PartnerOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<PartnerPick | null>(null);
  const [sent, setSent] = useState<{ url: string; phone: string | null; email: string | null } | null>(null);
  const [failed, setFailed] = useState<"name" | "generic" | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    if (!pick) {
      setFailed("name");
      return;
    }
    setFailed(null);
    startTransition(async () => {
      const result = await shareWithPartner(propertyId, pick);
      if (!result.ok) {
        setFailed("generic");
        return;
      }
      setSent({ url: linkUrl("listing", result.token), phone: result.phone, email: result.email });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPick(null);
          setSent(null);
          setFailed(null);
          setOpen(true);
        }}
        className={buttonClass.secondary}
      >
        <Send className="size-4" />
        {t.partners.shareWith}
      </button>
      {open && (
        <Modal title={t.partners.shareTitle} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">{t.partners.shareHint}</p>
          {!sent ? (
            <>
              <PartnerPicker partners={partners} onChange={setPick} />
              {failed && <p className="mt-3 text-sm text-danger">{failed === "name" ? t.partners.needName : t.errors.generic}</p>}
              <button type="button" onClick={create} disabled={pending} className={`${buttonClass.primary} mt-5 w-full`}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.share.create}
              </button>
            </>
          ) : (
            <SendLink url={sent.url} subject={title} text={fmt(t.partners.shareMessage, { title })} phone={sent.phone} email={sent.email} />
          )}
        </Modal>
      )}
    </>
  );
}
