import type { Currency, OperationType } from "./options";
import type { PropertyInput } from "./validation";

/** Raw form state — numbers are kept as strings while the user types. */
export type PropertyFormValues = {
  categoryId: string;
  subtypeId: string;
  operationType: OperationType;
  title: string;
  settlementId: string;
  neighborhoodId: string | null;
  address: string;
  area: string;
  rooms: string;
  bedrooms: string;
  floor: string;
  totalFloors: string;
  condition: string;
  constructionType: string;
  exposure: string;
  furnishing: string;
  heating: string;
  price: string;
  currency: Currency;
  brokerId: string;
  ownerClientId: string | null;
  exclusiveContract: boolean;
  description: string;
  featureIds: string[];
};

export function emptyFormValues(userId: string): PropertyFormValues {
  return {
    categoryId: "",
    subtypeId: "",
    operationType: "sale",
    title: "",
    settlementId: "",
    neighborhoodId: null,
    address: "",
    area: "",
    rooms: "",
    bedrooms: "",
    floor: "",
    totalFloors: "",
    condition: "",
    constructionType: "",
    exposure: "",
    furnishing: "",
    heating: "",
    price: "",
    currency: "EUR",
    brokerId: userId,
    ownerClientId: null,
    exclusiveContract: false,
    description: "",
    featureIds: [],
  };
}

function parseNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
  return trimmed === "" ? null : Number(trimmed);
}

export function toInput(values: PropertyFormValues): PropertyInput {
  return {
    ...values,
    area: parseNumber(values.area),
    rooms: parseNumber(values.rooms),
    bedrooms: parseNumber(values.bedrooms),
    floor: parseNumber(values.floor),
    totalFloors: parseNumber(values.totalFloors),
    price: parseNumber(values.price),
    condition: values.condition || null,
    constructionType: values.constructionType || null,
    exposure: values.exposure || null,
    furnishing: values.furnishing || null,
    heating: values.heating || null,
    brokerId: values.brokerId || null,
  };
}
