import {
  CLIENT_CLASSES,
  CLIENT_SOURCES,
  CLIENT_STAGES,
  CLIENT_TYPES,
  CURRENCIES,
  SEEKING_TYPES,
  isOneOf,
  type ClientClass,
  type ClientStage,
  type ClientType,
  type Currency,
} from "./options";
import { isValidEmail, type ErrorCode } from "./validation";

export type SearchInput = {
  operation: "sale" | "rent";
  subtypeIds: string[];
  settlementIds: string[];
  neighborhoodIds: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  currency: Currency;
  areaMin: number | null;
  areaMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  featureIds: string[];
};

export type ClientInput = {
  fullName: string;
  phone: string;
  email: string;
  types: ClientType[];
  clientClass: ClientClass;
  source: string | null;
  stage: ClientStage;
  notes: string;
  brokerId: string | null;
  /** only saved when the client is a buyer / tenant / investor */
  search: SearchInput;
};

export type ClientErrors = Partial<
  Record<keyof Omit<ClientInput, "search"> | `search.${keyof SearchInput}`, ErrorCode>
>;

export const NOTES_MAX = 5000;

export function isSeeking(types: readonly string[]) {
  return types.some((type) => (SEEKING_TYPES as readonly string[]).includes(type));
}

export function emptySearch(): SearchInput {
  return {
    operation: "sale",
    subtypeIds: [],
    settlementIds: [],
    neighborhoodIds: [],
    budgetMin: null,
    budgetMax: null,
    currency: "EUR",
    areaMin: null,
    areaMax: null,
    roomsMin: null,
    roomsMax: null,
    featureIds: [],
  };
}

function checkRange(
  errors: ClientErrors,
  minKey: keyof SearchInput,
  maxKey: keyof SearchInput,
  min: number | null,
  max: number | null,
  integer = false
) {
  for (const [key, value] of [[minKey, min], [maxKey, max]] as const) {
    if (value === null) continue;
    if (!Number.isFinite(value) || value < 0) errors[`search.${key}`] = "positive";
    else if (integer && !Number.isInteger(value)) errors[`search.${key}`] = "integer";
  }
  if (min !== null && max !== null && min > max && !errors[`search.${maxKey}`]) {
    errors[`search.${maxKey}`] = "range";
  }
}

export function validateClient(input: ClientInput): ClientErrors {
  const errors: ClientErrors = {};

  const name = input.fullName.trim();
  if (!name) errors.fullName = "required";
  else if (name.length < 2) errors.fullName = "tooShort";
  else if (name.length > 120) errors.fullName = "tooLong";

  const phone = input.phone.trim();
  if (phone && !/^\+?[\d\s()/-]{5,40}$/.test(phone)) errors.phone = "invalidPhone";

  const email = input.email.trim();
  if (email && (!isValidEmail(email) || email.length > 200)) errors.email = "invalidEmail";

  if (input.types.length === 0) errors.types = "required";
  else if (!input.types.every((type) => isOneOf(CLIENT_TYPES, type))) errors.types = "invalid";

  if (!isOneOf(CLIENT_CLASSES, input.clientClass)) errors.clientClass = "invalid";
  if (input.source !== null && !isOneOf(CLIENT_SOURCES, input.source)) errors.source = "invalid";
  if (!isOneOf(CLIENT_STAGES, input.stage)) errors.stage = "invalid";
  if (input.notes.length > NOTES_MAX) errors.notes = "tooLong";

  if (isSeeking(input.types)) {
    const s = input.search;
    if (s.operation !== "sale" && s.operation !== "rent") errors["search.operation"] = "invalid";
    if (!isOneOf(CURRENCIES, s.currency)) errors["search.currency"] = "invalid";
    checkRange(errors, "budgetMin", "budgetMax", s.budgetMin, s.budgetMax);
    checkRange(errors, "areaMin", "areaMax", s.areaMin, s.areaMax);
    checkRange(errors, "roomsMin", "roomsMax", s.roomsMin, s.roomsMax, true);
  }

  return errors;
}
