import { CLOSED_CONDITIONS, CLOSED_SIDES, CONSTRUCTION_TYPES, isOneOf, type ClosedCondition, type ClosedSide } from "./options";
import type { ErrorCode } from "./validation";

/** One deal in the register (money in euro). */
export type ClosedDealInput = {
  reportedOn: string;
  subtypeId: string | null;
  settlementId: string | null;
  neighborhoodId: string | null;
  address: string;
  side: ClosedSide;
  conditions: ClosedCondition[];
  construction: string | null;
  parking: boolean;
  area: number | null;
  price: number | null;
  parkingPrice: number | null;
  brokerId: string | null;
  /** "": nobody; "other": a colleague at another agency; else one of our brokers */
  colleague: string;
  colleagueName: string;
  colleagueAgency: string;
  doubleSided: boolean;
  propertyId: string | null;
  note: string;
};

export type ClosedDealErrors = Partial<Record<keyof ClosedDealInput, ErrorCode>>;

export const CLOSED_LIMITS = { address: 300, name: 120, note: 2000, amount: 100_000_000 };

export function validateClosedDeal(input: ClosedDealInput): ClosedDealErrors {
  const errors: ClosedDealErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportedOn) || Number.isNaN(Date.parse(input.reportedOn))) errors.reportedOn = "invalid";
  if (!input.subtypeId) errors.subtypeId = "required";
  if (!isOneOf(CLOSED_SIDES, input.side)) errors.side = "invalid";
  if (!input.conditions.every((c) => isOneOf(CLOSED_CONDITIONS, c))) errors.conditions = "invalid";
  if (input.construction !== null && !isOneOf(CONSTRUCTION_TYPES, input.construction)) errors.construction = "invalid";
  if (input.address.length > CLOSED_LIMITS.address) errors.address = "tooLong";
  if (input.area === null) errors.area = "required";
  else if (!(Number.isFinite(input.area) && input.area > 0)) errors.area = "positive";
  if (input.price === null) errors.price = "required";
  else if (!(Number.isFinite(input.price) && input.price >= 0 && input.price <= CLOSED_LIMITS.amount)) errors.price = "positive";
  if (input.parkingPrice !== null && !(Number.isFinite(input.parkingPrice) && input.parkingPrice >= 0)) errors.parkingPrice = "positive";
  if (!input.brokerId) errors.brokerId = "required";
  if (input.colleague === "other") {
    if (!input.colleagueName.trim() && !input.colleagueAgency.trim()) errors.colleagueName = "required";
    if (input.colleagueName.length > CLOSED_LIMITS.name) errors.colleagueName = "tooLong";
    if (input.colleagueAgency.length > CLOSED_LIMITS.name) errors.colleagueAgency = "tooLong";
  }
  if (input.note.length > CLOSED_LIMITS.note) errors.note = "tooLong";
  return errors;
}
