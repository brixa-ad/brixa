import { CURRENCIES, DEAL_KINDS, dealStages, isOneOf, type Currency, type DealKind, type DealStage } from "./options";
import type { ErrorCode } from "./validation";

export type DealInput = {
  kind: DealKind;
  propertyId: string | null;
  clientId: string | null;
  brokerId: string;
  stage: DealStage;
  price: number | null;
  currency: Currency;
  /** euro */
  commission: number | null;
  notes: string;
  /** both sides pay: buyerRate is the buyer's % (rent: months) */
  doubleSided: boolean;
  buyerRate: number | null;
  /** the other side is another agency */
  withPartner: boolean;
  partnerAgency: string;
  partnerBroker: string;
  partnerSide: PartnerSide;
};

export const PARTNER_SIDES = ["buyer", "seller"] as const;
export type PartnerSide = (typeof PARTNER_SIDES)[number];

export type DealErrors = Partial<Record<keyof DealInput, ErrorCode>>;

export const DEAL_LIMITS = { notes: 5000, reason: 500, amount: 100_000_000, name: 120 };

export function validateDeal(input: DealInput): DealErrors {
  const errors: DealErrors = {};
  if (!isOneOf(DEAL_KINDS, input.kind)) errors.kind = "invalid";
  else if (!dealStages(input.kind).includes(input.stage)) errors.stage = "invalid";
  if (!input.propertyId && !input.clientId) {
    errors.propertyId = "required";
    errors.clientId = "required";
  }
  if (!input.brokerId) errors.brokerId = "required";
  checkAmount(errors, "price", input.price);
  checkAmount(errors, "commission", input.commission);
  if (!isOneOf(CURRENCIES, input.currency)) errors.currency = "invalid";
  if (!input.notes.trim()) errors.notes = "required";
  else if (input.notes.length > DEAL_LIMITS.notes) errors.notes = "tooLong";
  if (input.doubleSided) {
    const max = input.kind === "rent" ? 24 : 100;
    if (input.buyerRate === null) errors.buyerRate = "required";
    else if (!Number.isFinite(input.buyerRate) || input.buyerRate < 0 || input.buyerRate > max) errors.buyerRate = "range";
  }
  if (input.withPartner) {
    const agency = input.partnerAgency.trim();
    if (!agency) errors.partnerAgency = "required";
    else if (agency.length > DEAL_LIMITS.name) errors.partnerAgency = "tooLong";
    if (input.partnerBroker.trim().length > DEAL_LIMITS.name) errors.partnerBroker = "tooLong";
    if (!isOneOf(PARTNER_SIDES, input.partnerSide)) errors.partnerSide = "invalid";
  }
  return errors;
}

function checkAmount(errors: DealErrors, key: "price" | "commission", value: number | null) {
  if (value === null) return;
  if (!Number.isFinite(value)) errors[key] = "invalid";
  else if (value < 0) errors[key] = "positive";
  else if (value > DEAL_LIMITS.amount) errors[key] = "range";
}

/** "12 500,50" → 12500.5; empty → null */
export function parseAmount(value: string) {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
  return trimmed === "" ? null : Number(trimmed);
}

export function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
