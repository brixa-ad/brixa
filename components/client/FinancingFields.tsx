"use client";

import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { LOAN_STATES, type FinancingInput } from "@/lib/client-validation";
import { fmt } from "@/lib/i18n/dictionaries";
import { formatPrice } from "@/lib/format";

type MoneyKey = "ownFunds" | "bankAmount" | "bankFee";
export type FinancingDraft = Omit<FinancingInput, MoneyKey> & Record<MoneyKey, string>;
const MONEY_KEYS: MoneyKey[] = ["ownFunds", "bankAmount", "bankFee"];

// the banks that lend for homes in Bulgaria (any other can be typed in)
const BANKS = [
  "Банка ДСК",
  "УниКредит Булбанк",
  "Пощенска банка",
  "ОББ",
  "Fibank",
  "ЦКБ",
  "Алианц Банк България",
  "Инвестбанк",
  "Общинска банка",
  "ПроКредит Банк",
  "Токуда Банк",
  "Тексим Банк",
];

const parse = (value: string) => {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};

export function toFinancingDraft(f: FinancingInput): FinancingDraft {
  const draft = { ...f } as unknown as FinancingDraft;
  for (const key of MONEY_KEYS) draft[key] = f[key] === null ? "" : String(f[key]);
  return draft;
}

export function fromFinancingDraft(draft: FinancingDraft): FinancingInput {
  const f = { ...draft } as unknown as FinancingInput;
  for (const key of MONEY_KEYS) f[key] = parse(draft[key]);
  return f;
}

/** How a buyer pays: the loan, own funds and the bank's part, and the bank we took them to (with its fee). */
export function FinancingFields({
  financing,
  onChange,
  error,
}: {
  financing: FinancingDraft;
  onChange: <K extends keyof FinancingDraft>(key: K, value: FinancingDraft[K]) => void;
  error: (key: keyof FinancingInput) => string | undefined;
}) {
  const { t, lang } = useI18n();
  const own = parse(financing.ownFunds);
  const bank = parse(financing.bankAmount);
  const total = (own ?? 0) + (bank ?? 0);

  const money = (key: MoneyKey, label: string) => (
    <label className="block text-sm font-medium text-fg-2">
      {label}
      <input
        inputMode="decimal"
        value={financing[key]}
        aria-invalid={error(key) ? true : undefined}
        onChange={(e) => {
          if (/^[\d\s]*([.,]\d{0,2})?$/.test(e.target.value)) onChange(key, e.target.value);
        }}
        className={`${inputClass} mt-1.5`}
      />
      {error(key) && <span className="mt-1 block text-xs font-medium text-danger">{error(key)}</span>}
    </label>
  );

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.financing.loan}</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {([null, ...LOAN_STATES] as const).map((state) => (
            <button
              key={state ?? "unknown"}
              type="button"
              role="radio"
              aria-checked={financing.loan === state}
              onClick={() => onChange("loan", state)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                financing.loan === state ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"
              }`}
            >
              {state ? t.financing.loanStates[state] : t.financing.loanUnknown}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {money("ownFunds", t.financing.ownFunds)}
        {financing.loan !== "none" && money("bankAmount", t.financing.bankAmount)}
      </div>
      {own !== null && bank !== null && financing.loan !== "none" && total > 0 && (
        <p className="-mt-2 text-sm text-muted">{fmt(t.financing.total, { amount: formatPrice(total, "EUR", lang) ?? "" })}</p>
      )}

      {financing.loan !== "none" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            checked={financing.bankReferred}
            onChange={(e) => onChange("bankReferred", e.target.checked)}
            className="peer sr-only"
          />
          <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-accent/35 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow after:transition peer-checked:after:translate-x-4" />
          <span className="text-sm font-medium text-fg">{t.financing.referred}</span>
        </label>
      )}

      {financing.loan !== "none" && financing.bankReferred && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-fg-2">
            {t.financing.bankName}
            <input
              list="brixa-banks"
              value={financing.bankName}
              maxLength={80}
              placeholder={t.financing.bankNamePlaceholder}
              onChange={(e) => onChange("bankName", e.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <datalist id="brixa-banks">
              {BANKS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          {money("bankFee", t.financing.bankFee)}
          <label className="block text-sm font-medium text-fg-2">
            {t.financing.bankFeeReceived}
            <input
              type="date"
              value={financing.bankFeeReceivedOn ?? ""}
              aria-invalid={error("bankFeeReceivedOn") ? true : undefined}
              onChange={(e) => onChange("bankFeeReceivedOn", e.target.value || null)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <p className="text-xs text-muted sm:col-span-3">{t.financing.bankFeeHint}</p>
        </div>
      )}
    </div>
  );
}
