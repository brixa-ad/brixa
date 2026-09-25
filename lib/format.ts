import { locale, type Lang } from "./i18n/dictionaries";

export function formatPrice(value: number | null | undefined, currency: string, lang: Lang) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, lang: Lang, digits = 0) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(value);
}

export function formatDate(value: string, lang: Lang, withTime = false) {
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function settlementLabel(settlement: { name: string; settlement_type: string }) {
  return `${settlement.settlement_type} ${settlement.name}`;
}
