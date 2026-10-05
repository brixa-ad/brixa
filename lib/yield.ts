import { toEuro } from "./commission";

/** BRIXA's estimate of a listing's monthly rent in euro, from the agency's own market. */
export type RentEstimate = {
  rent: number;
  perSqm: number;
  /** where it comes from: the type in the neighbourhood / the town, every home there, or a price typed in Market */
  basis: "hood_type" | "manual_hood" | "town_type" | "hood" | "manual_town" | "town";
  /** how many rent listings and rented deals it rests on (none for a typed price) */
  samples: number | null;
};

const BASES: RentEstimate["basis"][] = ["hood_type", "manual_hood", "town_type", "hood", "manual_town", "town"];

/** The estimate as the database sends it (or null). */
export function parseEstimate(raw: unknown): RentEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { rent?: unknown; per_sqm?: unknown; basis?: unknown; samples?: unknown };
  const rent = Number(r.rent);
  if (!Number.isFinite(rent) || rent <= 0 || !BASES.includes(r.basis as RentEstimate["basis"])) return null;
  return {
    rent,
    perSqm: Number(r.per_sqm),
    basis: r.basis as RentEstimate["basis"],
    samples: r.samples === null || r.samples === undefined ? null : Number(r.samples),
  };
}

export type RentalYield = {
  /** € a month: the broker's own figure, else BRIXA's estimate */
  rent: number;
  fromBroker: boolean;
  /** % a year: rent × 12 ÷ price */
  gross: number;
  /** % a year: rent × 10 ÷ price — two months without a tenant, or the tax */
  real: number;
  /** years until the rent (10 months a year) pays the price back */
  payback: number;
};

/** What a listing for sale would bring as a rental (null: no price or no rent to go on). */
export function rentalYield(
  price: number | null,
  currency: string,
  expectedRent: number | null,
  estimate: RentEstimate | null
): RentalYield | null {
  const priceEur = price === null ? null : toEuro(price, currency);
  const rent = expectedRent ?? estimate?.rent ?? null;
  if (!priceEur || priceEur <= 0 || !rent || rent <= 0) return null;
  return {
    rent,
    fromBroker: expectedRent !== null,
    gross: ((rent * 12) / priceEur) * 100,
    real: ((rent * 10) / priceEur) * 100,
    payback: priceEur / (rent * 10),
  };
}
