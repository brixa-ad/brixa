"use client";

import { useState, useTransition } from "react";
import { FileBarChart } from "lucide-react";
import { createOwnerReport } from "@/app/(app)/properties/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { Modal, SendLink, linkUrl } from "./LinkDialog";

type Preset = "7" | "14" | "30" | "all" | "custom";

/** "New report": pick a period, add a note for the owner, get a link to send them. */
export function OwnerReportDialog({
  propertyId,
  title,
  listedOn,
  today,
  owner,
}: {
  propertyId: string;
  title: string;
  /** YYYY-MM-DD */
  listedOn: string;
  /** YYYY-MM-DD, Sofia */
  today: string;
  owner: { full_name: string; phone: string | null; email: string | null } | null;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [comment, setComment] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const presets: [Preset, string][] = [
    ["7", t.report.last7],
    ["14", t.report.last14],
    ["30", t.report.last30],
    ["all", t.report.sinceListed],
    ["custom", t.report.custom],
  ];

  function choose(next: Preset) {
    setPreset(next);
    if (next === "custom") return;
    setTo(today);
    setFrom(next === "all" ? (listedOn < today ? listedOn : today) : addDays(today, -(Number(next) - 1)));
  }

  function start() {
    choose("30");
    setComment("");
    setUrl(null);
    setFailed(false);
    setOpen(true);
  }

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createOwnerReport(propertyId, { from, to, comment });
      if (result.ok) setUrl(linkUrl("report", result.token));
      else setFailed(true);
    });
  }

  const period = `${formatDate(from, lang)} – ${formatDate(to, lang)}`;
  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent-fg" : "border-line-strong text-fg-2 hover:bg-raised"
    }`;

  return (
    <>
      <button type="button" onClick={start} className={`${buttonClass.secondary} w-full`}>
        <FileBarChart className="size-4" />
        {t.report.button}
      </button>

      {open && (
        <Modal title={t.report.title} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">{t.report.hint}</p>
          {!url ? (
            <>
              <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.report.period}</span>
              <div className="flex flex-wrap gap-2">
                {presets.map(([value, label]) => (
                  <button key={value} type="button" onClick={() => choose(value)} className={chip(preset === value)}>
                    {label}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-sm text-fg-2">
                    {t.report.from}
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="text-sm text-fg-2">
                    {t.report.to}
                    <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
                  </label>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">{period}</p>
              )}

              <label className="mb-1.5 mt-4 block text-sm font-medium text-fg-2" htmlFor="report-comment">
                {t.report.comment}
              </label>
              <textarea
                id="report-comment"
                rows={4}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t.report.commentPlaceholder}
                className={inputClass}
              />

              {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
              <button
                type="button"
                onClick={create}
                disabled={pending || !from || !to || from > to}
                className={`${buttonClass.primary} mt-5 w-full`}
              >
                {pending ? t.common.saving : t.report.create}
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm font-medium">
                {owner ? fmt(t.report.sendTo, { name: owner.full_name }) : t.report.noOwner}
              </p>
              <SendLink
                url={url}
                subject={`${t.report.pageTitle}: ${title}`}
                text={fmt(t.report.message, { title, period })}
                phone={owner?.phone ?? null}
                email={owner?.email ?? null}
              />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
