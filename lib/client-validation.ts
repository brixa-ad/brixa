import {
  CLIENT_CLASSES,
  CLIENT_SOURCES,
  CLIENT_STAGES,
  CLIENT_TYPES,
  CURRENCIES,
  OFFERING_TYPES,
  SEEKING_TYPES,
  isOneOf,
  type ClientClass,
  type ClientStage,
  type ClientType,
  type Currency,
} from "./options";
import { isIdCard, parseEgn } from "./egn";
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

/** What a seller / landlord has — kept even before (or without) a listing. */
export type OfferInput = {
  operation: "sale" | "rent";
  subtypeId: string | null;
  settlementId: string | null;
  neighborhoodId: string | null;
  area: number | null;
  rooms: number | null;
  price: number | null;
  currency: Currency;
};

/** When they'll buy or sell: it puts them in a lane (A hot, B warm, C cold). */
export const TIMELINES = ["now", "soon", "later"] as const;
export type Timeline = (typeof TIMELINES)[number];
export const TIMELINE_CLASS: Record<Timeline, ClientClass> = { now: "A", soon: "B", later: "C" };
export const DECIDERS = ["alone", "partner", "others"] as const;
export type Decider = (typeof DECIDERS)[number];
export const MOTIVE_MAX = 300;

export const LOAN_STATES = ["approved", "applying", "none"] as const;
export type LoanState = (typeof LOAN_STATES)[number];

/** How a buyer pays: the loan, their own money and the bank's, and the bank we took them to. */
export type FinancingInput = {
  loan: LoanState | null;
  ownFunds: number | null;
  bankAmount: number | null;
  bankReferred: boolean;
  bankName: string;
  /** what the bank pays us for them, and the day it came (YYYY-MM-DD) */
  bankFee: number | null;
  bankFeeReceivedOn: string | null;
};

export type ClientInput = {
  fullName: string;
  phone: string;
  email: string;
  types: ClientType[];
  clientClass: ClientClass;
  source: string | null;
  /** who referred the client (a referral or an external broker) */
  referrer: string;
  stage: ClientStage;
  /** qualifying: when, who decides, why */
  timeline: Timeline | null;
  decider: Decider | null;
  motive: string;
  notes: string;
  /** a birthday for greetings: both or neither (an ЕГН fills it in) */
  birthDay: number | null;
  birthMonth: number | null;
  /** for contracts — kept apart, only the broker and the managers see them */
  egn: string;
  idCard: string;
  brokerId: string | null;
  /** only saved when the client is a buyer / tenant / investor */
  search: SearchInput;
  /** only saved when the client is a seller / landlord */
  offer: OfferInput;
  financing: FinancingInput;
};

export type ClientErrors = Partial<
  Record<
    | keyof Omit<ClientInput, "search" | "offer" | "financing">
    | `search.${keyof SearchInput}`
    | `offer.${keyof OfferInput}`
    | `financing.${keyof FinancingInput}`,
    ErrorCode
  >
>;

export const NOTES_MAX = 5000;

export function isSeeking(types: readonly string[]) {
  return types.some((type) => (SEEKING_TYPES as readonly string[]).includes(type));
}

export function isOffering(types: readonly string[]) {
  return types.some((type) => (OFFERING_TYPES as readonly string[]).includes(type));
}

export function emptyOffer(): OfferInput {
  return {
    operation: "sale",
    subtypeId: null,
    settlementId: null,
    neighborhoodId: null,
    area: null,
    rooms: null,
    price: null,
    currency: "EUR",
  };
}

/** Anything filled in beyond the defaults? */
export function hasOffer(offer: OfferInput) {
  return Boolean(offer.subtypeId || offer.settlementId || offer.area !== null || offer.rooms !== null || offer.price !== null);
}

export function emptyFinancing(): FinancingInput {
  return { loan: null, ownFunds: null, bankAmount: null, bankReferred: false, bankName: "", bankFee: null, bankFeeReceivedOn: null };
}

/** Anything filled in? */
export function hasFinancing(f: FinancingInput) {
  return Boolean(f.loan || f.ownFunds !== null || f.bankAmount !== null || f.bankReferred || f.bankName.trim() || f.bankFee !== null || f.bankFeeReceivedOn);
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

  if (input.egn.trim() && !parseEgn(input.egn)) errors.egn = "invalid";
  if (input.idCard.trim() && !isIdCard(input.idCard)) errors.idCard = "invalid";

  // a real day of the month (29 February is fine — leap years)
  const { birthDay: d, birthMonth: m } = input;
  if ((d === null) !== (m === null)) errors.birthDay = "required";
  else if (d !== null && m !== null) {
    const days = new Date(Date.UTC(2000, m, 0)).getUTCDate();
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > days) errors.birthDay = "invalid";
  }

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
  if (input.referrer.trim().length > 120) errors.referrer = "tooLong";
  if (!isOneOf(CLIENT_STAGES, input.stage)) errors.stage = "invalid";
  if (input.timeline !== null && !isOneOf(TIMELINES, input.timeline)) errors.timeline = "invalid";
  if (input.decider !== null && !isOneOf(DECIDERS, input.decider)) errors.decider = "invalid";
  if (input.motive.trim().length > MOTIVE_MAX) errors.motive = "tooLong";
  if (!input.notes.trim()) errors.notes = "required";
  else if (input.notes.length > NOTES_MAX) errors.notes = "tooLong";

  if (isSeeking(input.types)) {
    const s = input.search;
    if (s.operation !== "sale" && s.operation !== "rent") errors["search.operation"] = "invalid";
    if (!isOneOf(CURRENCIES, s.currency)) errors["search.currency"] = "invalid";
    checkRange(errors, "budgetMin", "budgetMax", s.budgetMin, s.budgetMax);
    checkRange(errors, "areaMin", "areaMax", s.areaMin, s.areaMax);
    checkRange(errors, "roomsMin", "roomsMax", s.roomsMin, s.roomsMax, true);
  }

  const f = input.financing;
  if (f.loan !== null && !isOneOf(LOAN_STATES, f.loan)) errors["financing.loan"] = "invalid";
  for (const key of ["ownFunds", "bankAmount", "bankFee"] as const) {
    const value = f[key];
    if (value !== null && !(Number.isFinite(value) && value >= 0 && value < 1e11)) errors[`financing.${key}`] = "positive";
  }
  if (f.bankName.trim().length > 80) errors["financing.bankName"] = "tooLong";
  if (f.bankFeeReceivedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(f.bankFeeReceivedOn)) errors["financing.bankFeeReceivedOn"] = "invalid";

  if (isOffering(input.types)) {
    const o = input.offer;
    if (o.operation !== "sale" && o.operation !== "rent") errors["offer.operation"] = "invalid";
    if (!isOneOf(CURRENCIES, o.currency)) errors["offer.currency"] = "invalid";
    if (o.area !== null && !(Number.isFinite(o.area) && o.area > 0)) errors["offer.area"] = "positive";
    if (o.price !== null && !(Number.isFinite(o.price) && o.price >= 0)) errors["offer.price"] = "positive";
    if (o.rooms !== null && !(Number.isInteger(o.rooms) && o.rooms >= 0 && o.rooms <= 100)) errors["offer.rooms"] = "integer";
  }

  return errors;
}
