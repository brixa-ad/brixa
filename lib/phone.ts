/** "0888 123 456" → "+359888123456" (Bulgarian numbers are often written without the country code). */
export function internationalPhone(raw: string) {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("359")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+359${cleaned.slice(1)}`;
  return cleaned;
}

export const telHref = (phone: string) => `tel:${internationalPhone(phone)}`;
/** Opens a Viber chat with the number (phone or computer app). */
export const viberHref = (phone: string) => `viber://chat?number=${encodeURIComponent(internationalPhone(phone))}`;
export const mailHref = (email: string) => `mailto:${email}`;
/** A WhatsApp chat (with the number, or pick one), optionally with the message typed in. */
export const whatsappHref = (phone: string | null, text?: string) =>
  `https://wa.me/${phone ? internationalPhone(phone).replace(/\D/g, "") : ""}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export type ContactKind = "call" | "viber" | "email";
