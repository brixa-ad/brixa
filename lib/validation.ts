import {
  CONDITIONS,
  CONSTRUCTION_TYPES,
  CURRENCIES,
  EXPOSURES,
  FURNISHINGS,
  HEATINGS,
  OPERATION_TYPES,
  isOneOf,
  type Currency,
  type OperationType,
} from "./options";
import type { Dictionary } from "./i18n/dictionaries";

/** Shape the form sends to the server. Numbers are already parsed. */
export type PropertyInput = {
  categoryId: string;
  subtypeId: string;
  operationType: OperationType;
  title: string;
  settlementId: string;
  neighborhoodId: string | null;
  address: string;
  area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  condition: string | null;
  constructionType: string | null;
  exposure: string | null;
  furnishing: string | null;
  heating: string | null;
  price: number | null;
  currency: Currency;
  brokerId: string | null;
  ownerClientId: string | null;
  exclusiveContract: boolean;
  description: string;
  featureIds: string[];
};

export type ErrorCode = keyof Dictionary["errors"];
export type FieldErrors = Partial<Record<keyof PropertyInput, ErrorCode>>;

export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 5000;

/** Categories where rooms / floors don't make sense. */
export function hasBuildingFields(categoryCode: string | undefined) {
  return categoryCode !== "land";
}

export function validateProperty(input: PropertyInput, categoryCode?: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.categoryId) errors.categoryId = "required";
  if (!input.subtypeId) errors.subtypeId = "required";
  if (!isOneOf(OPERATION_TYPES, input.operationType)) errors.operationType = "invalid";

  const title = input.title.trim();
  if (!title) errors.title = "required";
  else if (title.length < 5) errors.title = "tooShort";
  else if (title.length > TITLE_MAX) errors.title = "tooLong";

  if (!input.settlementId) errors.settlementId = "required";
  if (input.address.length > 300) errors.address = "tooLong";

  checkNumber(errors, "area", input.area, { positive: true });

  if (hasBuildingFields(categoryCode)) {
    checkNumber(errors, "rooms", input.rooms, { integer: true, min: 0, max: 100 });
    checkNumber(errors, "bedrooms", input.bedrooms, { integer: true, min: 0, max: 100 });
    checkNumber(errors, "floor", input.floor, { integer: true, min: -5, max: 200 });
    checkNumber(errors, "totalFloors", input.totalFloors, { integer: true, min: 1, max: 200 });

    if (
      !errors.floor &&
      !errors.totalFloors &&
      input.floor !== null &&
      input.totalFloors !== null &&
      input.floor > input.totalFloors
    ) {
      errors.floor = "floorAboveTotal";
    }

    if (
      !errors.bedrooms &&
      !errors.rooms &&
      input.bedrooms !== null &&
      input.rooms !== null &&
      input.bedrooms > input.rooms
    ) {
      errors.bedrooms = "bedroomsAboveRooms";
    }
  }

  checkOption(errors, "condition", input.condition, CONDITIONS);
  checkOption(errors, "constructionType", input.constructionType, CONSTRUCTION_TYPES);
  checkOption(errors, "exposure", input.exposure, EXPOSURES);
  checkOption(errors, "furnishing", input.furnishing, FURNISHINGS);
  checkOption(errors, "heating", input.heating, HEATINGS);

  // Sale and rent listings must have a price; buy / wanted requests may leave it open.
  const priceRequired = input.operationType === "sale" || input.operationType === "rent";
  if (input.price === null) {
    if (priceRequired) errors.price = "required";
  } else {
    checkNumber(errors, "price", input.price, { positive: true, max: 1_000_000_000 });
  }
  if (!isOneOf(CURRENCIES, input.currency)) errors.currency = "invalid";

  if (input.description.length > DESCRIPTION_MAX) errors.description = "tooLong";

  return errors;
}

function checkNumber(
  errors: FieldErrors,
  field: keyof PropertyInput,
  value: number | null,
  rules: { positive?: boolean; integer?: boolean; min?: number; max?: number }
) {
  if (value === null) return;
  if (!Number.isFinite(value)) errors[field] = "invalid";
  else if (rules.positive && value <= 0) errors[field] = "positive";
  else if (rules.integer && !Number.isInteger(value)) errors[field] = "integer";
  else if (rules.min !== undefined && value < rules.min) errors[field] = "range";
  else if (rules.max !== undefined && value > rules.max) errors[field] = "range";
}

function checkOption(
  errors: FieldErrors,
  field: keyof PropertyInput,
  value: string | null,
  list: readonly string[]
) {
  if (value !== null && !list.includes(value)) errors[field] = "invalid";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
