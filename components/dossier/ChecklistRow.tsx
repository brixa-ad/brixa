"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Clock, Globe, MapPin, Phone, ShieldCheck } from "lucide-react";
import { setDocStatus } from "@/app/(app)/documents/actions";
import { useI18n } from "@/components/I18nProvider";
import { PropertyDocuments } from "@/components/property/PropertyDocuments";
import type { DocStatus, DossierFile } from "@/lib/property-dossier";
import { mapHref, type SaleDoc } from "@/lib/sale-docs";

export type Where = { name: string; address: string | null; phone: string | null } | { elsewhere: string } | null;

const STATUSES: DocStatus[] = ["have", "need", "ordered", "na"];
const TONE: Record<DocStatus, string> = {
  have: "border-success bg-success/15 text-success",
  need: "border-warning bg-warning/15 text-warning",
  ordered: "border-accent bg-accent-soft text-accent-fg",
  na: "border-line-strong bg-raised text-muted",
};

/** One document of the property's checklist: its status, and — when it must be obtained — where, what it costs, how long. */
export function ChecklistRow({
  propertyId,
  organizationId,
  userId,
  doc,
  status: initialStatus,
  files,
  where,
  fee,
  term,
}: {
  propertyId: string;
  organizationId: string;
  userId: string;
  doc: SaleDoc;
  status: DocStatus | null;
  files: DossierFile[];
  where: Where;
  fee: string | null;
  term: string | null;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState(initialStatus);
  const [open, setOpen] = useState(initialStatus === "need" || initialStatus === "ordered");
  const [pending, startTransition] = useTransition();

  const pick = (next: DocStatus) => {
    const value = status === next ? null : next;
    setStatus(value);
    if (value === "need" || value === "ordered") setOpen(true);
    startTransition(async () => {
      const result = await setDocStatus(propertyId, doc.code, value);
      if (!result.ok) setStatus(status);
    });
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className={`flex items-center gap-1.5 font-medium ${status === "na" ? "text-muted line-through" : ""}`}>
            {status === "have" && <Check className="size-4 shrink-0 text-success" />}
            {doc.title}
            <ChevronDown className={`size-4 shrink-0 text-faint transition ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        <div className="flex flex-wrap gap-1" role="group" aria-label={doc.title}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              aria-pressed={status === s}
              onClick={() => pick(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                status === s ? TONE[s] : "border-line text-muted hover:border-line-strong hover:text-fg"
              }`}
            >
              {t.dossier.statuses[s]}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2.5 rounded-xl bg-raised/50 p-3 text-sm">
          {doc.about && <p className="leading-relaxed text-fg-2">{doc.about}</p>}
          {/* where it comes from */}
          {where && "name" in where && (
            <div>
              <p className="font-semibold">{where.name}</p>
              {where.address && (
                <a href={mapHref(where.address)} target="_blank" rel="noreferrer" className="mt-0.5 flex items-start gap-1.5 text-fg-2 hover:text-accent-fg">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  {where.address}
                </a>
              )}
              {where.phone && (
                <a href={`tel:${where.phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 flex items-center gap-1.5 text-fg-2 hover:text-accent-fg">
                  <Phone className="size-4 shrink-0" />
                  {where.phone}
                </a>
              )}
            </div>
          )}
          {where && "elsewhere" in where && <p className="text-fg-2">{where.elsewhere}</p>}
          <dl className="space-y-1">
            {fee && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-muted">{t.saleDocs.fee}:</dt>
                <dd className="font-medium">{fee}</dd>
              </div>
            )}
            {term && (
              <div className="flex gap-1.5">
                <dt className="flex shrink-0 items-center gap-1 text-muted">
                  <Clock className="size-3.5" />
                  {t.saleDocs.term}:
                </dt>
                <dd className="font-medium">{term}</dd>
              </div>
            )}
            {doc.validity && (
              <div className="flex gap-1.5">
                <dt className="flex shrink-0 items-center gap-1 text-muted">
                  <ShieldCheck className="size-3.5" />
                  {t.saleDocs.validity}:
                </dt>
                <dd>{doc.validity}</dd>
              </div>
            )}
            {doc.online && (
              <div className="flex gap-1.5">
                <dt className="flex shrink-0 items-center gap-1 text-muted">
                  <Globe className="size-3.5" />
                  {t.saleDocs.online}:
                </dt>
                <dd>{doc.online}</dd>
              </div>
            )}
          </dl>
          {/* the file itself */}
          <PropertyDocuments propertyId={propertyId} organizationId={organizationId} userId={userId} documents={files} docCode={doc.code} compact />
        </div>
      )}
    </li>
  );
}
