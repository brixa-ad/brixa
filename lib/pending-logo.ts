// The logo picked when an agency signs up. There's no session yet (the email still needs
// confirming), so it waits in this browser and goes up the first time the owner signs in here.

const KEY = "brixa.pendingLogo";
const MAX_SIDE = 512;
const KEEP_FOR = 3 * 24 * 60 * 60 * 1000;

/** Fit within 512×512 as a PNG (keeps transparency); an SVG or an unreadable file stays as it is. */
export async function shrinkLogo(file: File): Promise<Blob> {
  if (file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ?? file;
  } catch {
    return file;
  }
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export function keepPendingLogo(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KEY, JSON.stringify({ dataUrl, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode or full — the logo can be added in Settings
  }
}

/** The waiting logo (and forget it), if there is a fresh one. */
export async function takePendingLogo(): Promise<Blob | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { dataUrl, at } = JSON.parse(raw) as { dataUrl: string; at: number };
    if (!dataUrl?.startsWith("data:image/") || Date.now() - at > KEEP_FOR) return null;
    return await (await fetch(dataUrl)).blob();
  } catch {
    return null;
  }
}
