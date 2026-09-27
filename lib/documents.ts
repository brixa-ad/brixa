/** Property documents (deeds, sketches, contracts…) — a private bucket. */
export const DOCUMENT_BUCKET = "property-documents";
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt";
