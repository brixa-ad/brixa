// Fixed option lists. Codes are stored in the database; labels live in the dictionaries.

export const OPERATION_TYPES = ["sale", "rent", "buy", "wanted"] as const;
export const STATUSES = ["active", "reserved", "sold", "rented", "withdrawn"] as const;
export const CURRENCIES = ["EUR", "BGN", "USD"] as const;

export const CONDITIONS = [
  "under_construction",
  "act14",
  "act15",
  "act16",
  "new",
  "renovated",
  "good",
  "needs_renovation",
] as const;

export const CONSTRUCTION_TYPES = [
  "brick",
  "panel",
  "epk",
  "pk",
  "monolithic",
  "beam",
  "wood",
  "prefab",
] as const;

export const EXPOSURES = [
  "south",
  "north",
  "east",
  "west",
  "south_east",
  "south_west",
  "north_east",
  "north_west",
  "east_west",
  "south_north",
  "multiple",
] as const;

export const FURNISHINGS = ["unfurnished", "partly", "furnished", "luxury"] as const;

export const HEATINGS = [
  "central",
  "gas",
  "electric",
  "air_conditioning",
  "heat_pump",
  "solid_fuel",
  "none",
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];
export type Exposure = (typeof EXPOSURES)[number];
export type Furnishing = (typeof FURNISHINGS)[number];
export type Heating = (typeof HEATINGS)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
