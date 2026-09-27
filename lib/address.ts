/** A property's address in parts (as Bulgarian addresses are written). */
export type AddressParts = {
  street: string;
  streetNo: string;
  block: string;
  entrance: string;
  apartment: string;
};

export const ADDRESS_LIMITS = { street: 120, streetNo: 20, block: 20, entrance: 10, apartment: 20, cadastralId: 60 };

/**
 * "ул. Оборище 12, бл. 5, вх. А, ет. 3, ап. 7" — saved as the property's address line
 * (used for search and lists). The floor only goes in for flats.
 */
export function composeAddress(parts: AddressParts, floor: number | null) {
  const street = [parts.street.trim(), parts.streetNo.trim()].filter(Boolean).join(" ");
  const block = parts.block.trim();
  const entrance = parts.entrance.trim();
  const apartment = parts.apartment.trim();
  return [
    street,
    block && `бл. ${block}`,
    entrance && `вх. ${entrance}`,
    floor !== null && (block || apartment) ? `ет. ${floor}` : "",
    apartment && `ап. ${apartment}`,
  ]
    .filter(Boolean)
    .join(", ");
}
