"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Eye, EyeOff, Link2Off } from "lucide-react";
import { stopOwnerReport, stopShare } from "@/app/(app)/properties/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { linkUrl, type LinkKind } from "./LinkDialog";

export type ShareRow = {
  id: string;
  token: string;
  /** what the row is about: the client (on a listing) or the listing (on a client) */
  name: string | null;
  href: string | null;
  sharedBy: string | null;
  views: number;
  lastViewedAt: string | null;
  revoked: boolean;
  createdAt: string;
  /** sent to a colleague from another agency */
  colleague?: boolean;
};

/** Links sent so far — who opened them and when; copy again or stop one. */
export function ShareList({ rows, empty, kind = "listing" }: { rows: ShareRow[]; empty: string; kind?: LinkKind }) {
  const { t, lang } = useI18n();
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line-soft">
      {rows.map((row) => (
        <li key={row.id} className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${row.revoked ? "opacity-60" : ""}`}>
          <span
            className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
              row.views > 0 ? "bg-success/10 text-success" : "bg-raised text-subtle"
            }`}
          >
            {row.views > 0 ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {row.href ? (
                <Link href={row.href} className="hover:text-accent-fg">
                  {row.name}
                </Link>
              ) : (
                (row.name ?? t.share.anyone)
              )}
            </p>
            <p className="text-xs text-subtle">
              {formatDate(row.createdAt, lang, true)}
              {row.sharedBy ? ` · ${row.sharedBy}` : ""}
            </p>
            <p className={`mt-0.5 text-xs ${row.views > 0 ? "font-medium text-success" : "text-muted"}`}>
              {row.revoked
                ? t.share.stopped
                : row.views > 0 && row.lastViewedAt
                  ? fmt(t.share.views, { count: row.views, when: formatDate(row.lastViewedAt, lang, true) })
                  : t.share.notViewed}
            </p>
          </div>
          {!row.revoked && <RowActions id={row.id} token={row.token} kind={kind} />}
        </li>
      ))}
    </ul>
  );
}

function RowActions({ id, token, kind }: { id: string; token: string; kind: LinkKind }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const icon = "grid size-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg disabled:opacity-50";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        title={t.share.copy}
        aria-label={t.share.copy}
        onClick={async () => {
          const url = linkUrl(kind, token);
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt(t.share.copy, url);
          }
        }}
        className={icon}
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
      <button
        type="button"
        title={t.share.stop}
        aria-label={t.share.stop}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t.share.stopConfirm)) return;
          startTransition(async () => {
            const result = await (kind === "report" ? stopOwnerReport(id) : stopShare(id));
            if (!result.ok) window.alert(t.errors.generic);
          });
        }}
        className={`${icon} hover:text-danger`}
      >
        <Link2Off className="size-4" />
      </button>
    </div>
  );
}
