"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, CheckCircle2, Loader2, RotateCcw, Trash2, Undo2, XCircle } from "lucide-react";
import {
  closeDeal,
  confirmDeal,
  deleteDeal,
  markDealLost,
  reopenDeal,
  setDealStage,
  type DealActionResult,
} from "@/app/(app)/deals/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { DEAL_LIMITS, isDay, parseAmount } from "@/lib/deal-validation";
import { dealStages, type DealKind, type DealStage, type DealStatus } from "@/lib/options";

function useDealAction() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<DealActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) after?.();
      else setError(result.message === "confirmed" ? t.deals.errorConfirmed : t.errors.generic);
    });
  }
  return { pending, error, run };
}

/** The stages as a row of steps; tap one to move the deal there. */
export function DealStageBar({
  dealId,
  kind,
  stage,
  status,
  canMove,
}: {
  dealId: string;
  kind: DealKind;
  stage: DealStage;
  status: DealStatus;
  canMove: boolean;
}) {
  const { t } = useI18n();
  const { pending, error, run } = useDealAction();
  const stages = dealStages(kind);
  const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
  const current = status === "won" ? stages.length - 1 : stages.indexOf(stage);
  const movable = canMove && status === "open" && !pending;

  return (
    <div>
      <ol className="flex gap-1.5" aria-busy={pending}>
        {stages.map((key, index) => {
          const reached = index <= current;
          return (
            <li key={key} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!movable || key === stage}
                onClick={() => run(() => setDealStage(dealId, key))}
                aria-current={index === current ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span
                  className={`block h-2 rounded-full transition ${
                    status === "lost"
                      ? reached
                        ? "bg-danger/50"
                        : "bg-raised"
                      : reached
                        ? "bg-gradient-to-r from-accent to-brand-cyan"
                        : "bg-raised group-enabled:group-hover:bg-accent/30"
                  }`}
                />
                <span
                  className={`mt-1.5 block truncate text-[11px] font-medium sm:text-xs ${
                    index === current ? "text-fg" : "text-subtle"
                  }`}
                >
                  {labels[key]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {movable && <p className="mt-2 text-xs text-muted">{t.deals.stageHint}</p>}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

/** Close as won (real commission) or lost; confirm / send back / reopen. */
export function DealActions({
  dealId,
  status,
  confirmed,
  commission,
  today,
  canEdit,
  isManager,
}: {
  dealId: string;
  status: DealStatus;
  confirmed: boolean;
  commission: number | null;
  today: string;
  canEdit: boolean;
  isManager: boolean;
}) {
  const { t } = useI18n();
  const { pending, error, run } = useDealAction();
  const [amount, setAmount] = useState(commission === null ? "" : String(commission));
  const [closedOn, setClosedOn] = useState(today);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");

  const parsed = parseAmount(amount);
  const amountOk = parsed !== null && Number.isFinite(parsed) && parsed >= 0;
  const spinner = pending ? <Loader2 className="size-4 animate-spin" /> : null;

  if (status === "open" && canEdit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">{isManager ? t.deals.closeHintManager : t.deals.closeHint}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <label className="block text-sm font-medium text-fg-2">
            {t.deals.realCommission}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && !amountOk ? true : undefined}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-sm font-medium text-fg-2">
            {t.deals.closedOn}
            <input
              type="date"
              value={closedOn}
              max={today}
              onChange={(e) => setClosedOn(e.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={pending || !amountOk || !isDay(closedOn)}
          onClick={() => run(() => closeDeal(dealId, parsed!, closedOn))}
          className={`${buttonClass.primary} w-full py-3`}
        >
          {spinner ?? <CheckCircle2 className="size-5" />}
          {t.deals.closeButton}
        </button>

        <div className="border-t border-line-soft pt-4">
          {losing ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-fg-2">
                {t.deals.lostReason}
                <input
                  value={reason}
                  maxLength={DEAL_LIMITS.reason}
                  placeholder={t.deals.lostReasonPlaceholder}
                  onChange={(e) => setReason(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLosing(false)} className={`${buttonClass.secondary} flex-1`}>
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => markDealLost(dealId, reason))}
                  className={`${buttonClass.danger} flex-1`}
                >
                  {spinner ?? <XCircle className="size-4" />}
                  {t.deals.lostConfirm}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setLosing(true)} className={`${buttonClass.ghost} w-full text-danger!`}>
              <XCircle className="size-4" />
              {t.deals.lostButton}
            </button>
          )}
        </div>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    );
  }

  if (status === "won" && !confirmed) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">{t.deals.pending}</p>
        {isManager ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmDeal(dealId))}
              className={`${buttonClass.primary} w-full py-3`}
            >
              {spinner ?? <BadgeCheck className="size-5" />}
              {t.deals.confirm}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => reopenDeal(dealId))} className={buttonClass.secondary}>
              <Undo2 className="size-4" />
              {t.deals.sendBack}
            </button>
          </div>
        ) : (
          canEdit && (
            <button type="button" disabled={pending} onClick={() => run(() => reopenDeal(dealId))} className={buttonClass.secondary}>
              {spinner ?? <RotateCcw className="size-4" />}
              {t.deals.reopen}
            </button>
          )
        )}
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    );
  }

  // Closed and confirmed, or lost.
  const canReopen = status === "won" ? isManager : canEdit;
  return (
    <div className="space-y-3">
      {status === "won" && !isManager && <p className="text-sm text-muted">{t.deals.lockedHint}</p>}
      {canReopen && (
        <button type="button" disabled={pending} onClick={() => run(() => reopenDeal(dealId))} className={buttonClass.secondary}>
          {spinner ?? <RotateCcw className="size-4" />}
          {t.deals.reopen}
        </button>
      )}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function DeleteDealButton({ dealId }: { dealId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.deals.deleteConfirm)) return;
        startTransition(async () => {
          const result = await deleteDeal(dealId);
          if (result && !result.ok) window.alert(t.errors.generic);
        });
      }}
      className={buttonClass.danger}
    >
      <Trash2 className="size-4" />
      {pending ? t.common.deleting : t.common.delete}
    </button>
  );
}
