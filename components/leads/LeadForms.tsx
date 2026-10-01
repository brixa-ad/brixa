"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Check, Copy, FolderPlus, Link2, Loader2 } from "lucide-react";
import { archiveLeadForm, createLeadForm } from "@/app/(app)/cold-contacts/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { LEAD_FORM_SOURCES, LEAD_FORM_TYPES, formScript } from "@/lib/leads";

/** The steps and the code that connect a Google Form to its folder. */
function ScriptSteps({ url, formName }: { url: string; formName: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = formScript(url, formName);
  return (
    <div>
      <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-fg-2">
        <li>{t.leads.step1}</li>
        <li>{t.leads.step2}</li>
        <li>{t.leads.step3}</li>
        <li>{t.leads.step4}</li>
        <li>{t.leads.step5}</li>
      </ol>
      <p className="mb-4 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{t.leads.step6}</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className={`${buttonClass.primary} mb-3 w-full`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t.leads.copied : t.leads.copyCode}
      </button>
      <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-raised/60 p-3 text-[11px] leading-relaxed text-fg-2">{code}</pre>
    </div>
  );
}

/** "Connect a Google Form" for a folder. */
export function ConnectFormButton({ url, formName }: { url: string; formName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass.secondary} px-3! py-1.5!`}>
        <Link2 className="size-4" />
        {t.leads.connect}
      </button>
      {open && (
        <Modal title={t.leads.scriptTitle} onClose={() => setOpen(false)} wide>
          <ScriptSteps url={url} formName={formName} />
        </Modal>
      )}
    </>
  );
}

/** A new folder (one survey or ad) — then straight to connecting its Google Form. */
export function NewLeadFormButton({
  members,
  isManager,
  selfId,
  baseUrl,
}: {
  members: { id: string; name: string }[];
  isManager: boolean;
  selfId: string;
  /** …/api/forms — the folder's token goes after it */
  baseUrl: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [broker, setBroker] = useState(selfId);
  const [clientType, setClientType] = useState<string>("buyer");
  const [source, setSource] = useState<string>("facebook");
  const [created, setCreated] = useState<{ url: string; name: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function start() {
    setName("");
    setBroker(selfId);
    setClientType("buyer");
    setSource("facebook");
    setCreated(null);
    setFailed(false);
    setOpen(true);
  }

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createLeadForm({ name, brokerId: broker || null, clientType, source });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setCreated({ url: `${baseUrl}/${result.token}`, name: name.trim() });
      router.refresh();
    });
  }

  const label = "mb-1.5 block text-sm font-medium text-fg-2";
  return (
    <>
      <button type="button" onClick={start} className={buttonClass.primary}>
        <FolderPlus className="size-4" />
        {t.leads.newForm}
      </button>
      {open && (
        <Modal title={created ? t.leads.scriptTitle : t.leads.newForm} onClose={() => setOpen(false)} wide={Boolean(created)}>
          {created ? (
            <ScriptSteps url={created.url} formName={created.name} />
          ) : (
            <div className="space-y-4">
              <div>
                <label className={label} htmlFor="lead-form-name">
                  {t.leads.name}
                </label>
                <input
                  id="lead-form-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.leads.namePlaceholder}
                  className={inputClass}
                />
              </div>
              {isManager && (
                <div>
                  <label className={label} htmlFor="lead-form-broker">
                    {t.leads.broker}
                  </label>
                  <select id="lead-form-broker" value={broker} onChange={(e) => setBroker(e.target.value)} className={inputClass}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    <option value="">{t.leads.noBroker}</option>
                  </select>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="lead-form-type">
                    {t.leads.clientType}
                  </label>
                  <select id="lead-form-type" value={clientType} onChange={(e) => setClientType(e.target.value)} className={inputClass}>
                    {LEAD_FORM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t.options.clientType[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="lead-form-source">
                    {t.leads.source}
                  </label>
                  <select id="lead-form-source" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                    {LEAD_FORM_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {t.options.source[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {failed && <p className="text-sm text-danger">{t.errors.generic}</p>}
              <button type="button" onClick={create} disabled={pending || name.trim().length < 2} className={`${buttonClass.primary} w-full`}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.leads.create}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** The folder stops taking answers (its contacts stay). */
export function ArchiveFormButton({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.leads.archiveConfirm)) return;
        startTransition(async () => {
          await archiveLeadForm(id);
          router.refresh();
        });
      }}
      className={`${buttonClass.ghost} px-2.5! py-1.5! text-muted`}
      aria-label={t.leads.archive}
      title={t.leads.archive}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
    </button>
  );
}
