import { CLOSED_CONDITIONS, CLOSED_SIDES, CONSTRUCTION_TYPES, isOneOf, type ClosedCondition, type ClosedSide } from "./options";
import type { ErrorCode } from "./validation";

/** One deal in the register (money in euro; brokers are plain names). */
export type ClosedDealInput = {
  reportedOn: string;
  subtypeId: string | null;
  settlementId: string | null;
  neighborhoodId: string | null;
  street: string;
  streetNo: string;
  block: string;
  entrance: string;
  floor: string;
  apartment: string;
  side: ClosedSide;
  conditions: ClosedCondition[];
  construction: string | null;
  parking: boolean;
  area: number | null;
  price: number | null;
  parkingPrice: number | null;
  brokerName: string;
  colleagueName: string;
  /** empty: the colleague is one of ours */
  colleagueAgency: string;
  /** our broker did both sides alone */
  doubleSided: boolean;
  propertyId: string | null;
  note: string;
};

export type ClosedDealErrors = Partial<Record<keyof ClosedDealInput, ErrorCode>>;

export const CLOSED_LIMITS = {
  name: 120,
  note: 2000,
  amount: 100_000_000,
  street: 120,
  streetNo: 20,
  block: 20,
  entrance: 10,
  floor: 10,
  apartment: 20,
};

/** "ул. Шипка 12, бл. 5, вх. А, ет. 3, ап. 7" — the address line for lists and search. */
export function closedAddress(i: Pick<ClosedDealInput, "street" | "streetNo" | "block" | "entrance" | "floor" | "apartment">) {
  const street = [i.street.trim(), i.streetNo.trim()].filter(Boolean).join(" ");
  return [
    street,
    i.block.trim() && `бл. ${i.block.trim()}`,
    i.entrance.trim() && `вх. ${i.entrance.trim()}`,
    i.floor.trim() && `ет. ${i.floor.trim()}`,
    i.apartment.trim() && `ап. ${i.apartment.trim()}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export function validateClosedDeal(input: ClosedDealInput): ClosedDealErrors {
  const errors: ClosedDealErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportedOn) || Number.isNaN(Date.parse(input.reportedOn))) errors.reportedOn = "invalid";
  if (!input.subtypeId) errors.subtypeId = "required";
  if (!isOneOf(CLOSED_SIDES, input.side)) errors.side = "invalid";
  if (!input.conditions.every((c) => isOneOf(CLOSED_CONDITIONS, c))) errors.conditions = "invalid";
  if (input.construction !== null && !isOneOf(CONSTRUCTION_TYPES, input.construction)) errors.construction = "invalid";
  for (const key of ["street", "streetNo", "block", "entrance", "floor", "apartment"] as const) {
    if (input[key].length > CLOSED_LIMITS[key]) errors[key] = "tooLong";
  }
  if (input.area === null) errors.area = "required";
  else if (!(Number.isFinite(input.area) && input.area > 0)) errors.area = "positive";
  if (input.price === null) errors.price = "required";
  else if (!(Number.isFinite(input.price) && input.price >= 0 && input.price <= CLOSED_LIMITS.amount)) errors.price = "positive";
  if (input.parkingPrice !== null && !(Number.isFinite(input.parkingPrice) && input.parkingPrice >= 0)) errors.parkingPrice = "positive";
  if (!input.brokerName.trim()) errors.brokerName = "required";
  else if (input.brokerName.length > CLOSED_LIMITS.name) errors.brokerName = "tooLong";
  if (input.colleagueName.length > CLOSED_LIMITS.name) errors.colleagueName = "tooLong";
  if (input.colleagueAgency.length > CLOSED_LIMITS.name) errors.colleagueAgency = "tooLong";
  if (input.note.length > CLOSED_LIMITS.note) errors.note = "tooLong";
  return errors;
}
