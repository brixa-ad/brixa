import type { DealKind } from "./options";

export type CommissionDefaults = { salePercent: number; rentMonths: number };

/** Sale: % of the price. Rent: months of rent. The property's own rate wins over the agency default. */
export function commissionRate(kind: DealKind, rate: number | null | undefined, defaults: CommissionDefaults) {
  return rate ?? (kind === "rent" ? defaults.rentMonths : defaults.salePercent);
}

/** Fixed rate since Bulgaria joined the euro. */
const BGN_PER_EUR = 1.95583;

export function toEuro(amount: number, currency: string) {
  if (currency === "EUR") return amount;
  if (currency === "BGN") return amount / BGN_PER_EUR;
  return null;
}

/** Expected commission in euro, or null when it can't be worked out. */
export function expectedCommission(kind: DealKind, price: number | null, currency: string, rate: number) {
  if (price === null || !Number.isFinite(price)) return null;
  const euro = toEuro(price, currency);
  if (euro === null) return null;
  return Math.round(kind === "rent" ? euro * rate : (euro * rate) / 100);
}

export function rateLabel(kind: DealKind, rate: number, monthsWord: string) {
  return kind === "rent" ? `${rate} ${monthsWord}` : `${rate}%`;
}
