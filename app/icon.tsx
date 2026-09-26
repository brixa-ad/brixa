import { brandIcon } from "@/lib/brand-icon";

const SIZES = [32, 192, 512];

// Served at /icon/32, /icon/192 and /icon/512 (the manifest points at the big ones).
export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    contentType: "image/png",
    size: { width: size, height: size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return brandIcon(SIZES.includes(size) ? size : 192);
}
