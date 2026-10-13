"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { saveDossier } from "@/app/(app)/documents/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { SALE_CASES, type SaleCase } from "@/lib/sale-docs";

/** The property's history in words, and the cases that add documents to its checklist. */
export function DossierForm({ propertyId, cases: initialCases, history: initialHistory }: { propertyId: string; cases: SaleCase[]; history: string }) {
  const { t } = useI18n();
  const [cases, setCases] = useState(initialCases);
  const [history, setHistory] = useState(initialHistory);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const save = (next: { cases?: SaleCase[]; history?: string }) =>
    startTransition(async () => {
      const result = await saveDossier(propertyId, { cases: next.cases ?? cases, history: next.history ?? history });
      setStatus(result.ok ? "saved" : "failed");
    });

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.dossier.casesTitle}</span>
        <div className="flex flex-wrap gap-1.5">
          {SALE_CASES.map((c) => {
            const on = cases.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => {
                  const next = on ? cases.filter((x) => x !== c) : [...cases, c];
                  setCases(next);
                  save({ cases: next });
                }}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
                }`}
              >
                {t.saleDocs.cases[c]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t.dossier.casesHint}</p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.dossier.history}</span>
        <NoteArea
          rows={6}
          maxLength={10000}
          value={history}
          placeholder={t.dossier.historyPlaceholder}
          onChange={(value) => {
            setHistory(value);
            setStatus("idle");
          }}
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" disabled={pending} onClick={() => save({ history })} className={buttonClass.primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.dossier.save}
          </button>
          {status === "saved" && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="size-4" />
              {t.dossier.saved}
            </span>
          )}
          {status === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
        </div>
      </div>
    </div>
  );
}
