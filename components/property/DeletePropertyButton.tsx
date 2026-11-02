"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteProperty, leaveMarket, type LeaveOutcome } from "@/app/(app)/properties/actions";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/ui/Modal";
import { buttonClass, inputClass } from "@/components/ui/form";
import { parseAmount } from "@/lib/deal-validation";

type Choice = LeaveOutcome | "mistake";

/**
 * "Delete" first asks what happened: sold by us, by another agency, or taken off the market —
 * the listing then goes to the archive with the price it went for. Only one entered by mistake is deleted for good.
 */
export function DeletePropertyButton({
  propertyId,
  operation,
  currency,
  today,
}: {
  propertyId: string;
  operation: string;
  currency: string;
  /** Sofia's today, for the date of the sale */
  today: string;
}) {
  const { t } = useI18n();
  const L = t.detail.leave;
  const rent = operation === "rent";
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [price, setPrice] = useState("");
  const [soldOn, setSoldOn] = useState(today);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const sold = choice === "ours" || choice === "elsewhere";
  const amount = parseAmount(price);
  const badPrice = amount !== null && !(Number.isFinite(amount) && amount > 0);

  const options: { value: Choice; label: string }[] = [
    { value: "ours", label: rent ? L.oursRent : L.ours },
    { value: "elsewhere", label: rent ? L.elsewhereRent : L.elsewhere },
    { value: "withdrawn", label: L.withdrawn },
    { value: "mistake", label: L.mistake },
  ];

  function close() {
    if (pending) return;
    setOpen(false);
    setChoice(null);
    setPrice("");
    setSoldOn(today);
    setFailed(false);
  }

  function submit() {
    if (!choice || badPrice) return;
    if (choice === "mistake" && !window.confirm(t.detail.deleteConfirm)) return;
    setFailed(false);
    startTransition(async () => {
      const result =
        choice === "mistake"
          ? await deleteProperty(propertyId)
          : await leaveMarket(propertyId, choice, sold ? amount : null, sold ? soldOn || null : null);
      // on success the page moves on by itself
      if (result && !result.ok) setFailed(true);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.danger}>
        <Trash2 className="size-4" />
        {t.common.delete}
      </button>

      {open && (
        <Modal title={L.title} onClose={close}>
          <p className="text-sm text-muted">{L.intro}</p>

          <div className="mt-4 space-y-2" role="radiogroup" aria-label={L.title}>
            {options.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  o.value === "mistake"
                    ? `text-danger ${choice === o.value ? "border-danger bg-danger/10" : "border-line hover:border-danger/40"}`
                    : choice === o.value
                      ? "border-accent bg-accent/10 text-fg"
                      : "border-line text-fg-2 hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="leave"
                  value={o.value}
                  checked={choice === o.value}
                  onChange={() => {
                    setChoice(o.value);
                    setFailed(false);
                  }}
                  className="size-4 accent-accent"
                />
                {o.label}
              </label>
            ))}
          </div>

          {sold && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-fg-2">
                  {rent ? L.priceRent : L.price} <span className="font-normal text-muted">({L.optional})</span>
                </span>
                <div className="relative">
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    aria-invalid={badPrice || undefined}
                    className={`${inputClass} pr-14`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{currency}</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-fg-2">{L.soldOn}</span>
                <input type="date" value={soldOn} max={today} onChange={(e) => setSoldOn(e.target.value)} className={inputClass} />
              </label>
              {amount !== null && !badPrice && (
                <p className="text-xs text-muted sm:col-span-2">{choice === "ours" && operation === "sale" ? L.register : L.market}</p>
              )}
            </div>
          )}

          {choice && choice !== "mistake" && <p className="mt-4 text-sm text-fg-2">{choice === "ours" ? L.toSold : L.toWithdrawn}</p>}
          {failed && <p className="mt-3 text-sm font-medium text-danger">{t.errors.generic}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={close} disabled={pending} className={buttonClass.secondary}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!choice || badPrice || pending}
              className={choice === "mistake" ? buttonClass.danger : buttonClass.primary}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {choice === "mistake" ? L.deleteForever : L.confirm}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
