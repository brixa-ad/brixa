/**
 * A listing photo made bright, clean and true to colour — in the browser, before it is uploaded.
 * Levels, white balance, exposure, shadows and highlights, contrast, vibrance and a touch of
 * sharpness: what a photo editor does to a property photo. Nothing in the picture is changed —
 * no sky, furniture or walls are made up.
 */

/** How much of each to do: -1 … 1 (0 = what the photo's own numbers call for). */
export type Look = {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  highlights: number;
  sharpen: number;
};

export const NEUTRAL_LOOK: Look = { exposure: 0, contrast: 0, saturation: 0, warmth: 0, shadows: 0, highlights: 0, sharpen: 0 };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const unit = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? clamp(value, -1, 1) : 0);

/** A look from whatever came back (Brix's answer): every number in -1 … 1, anything else 0. */
export function lookFrom(value: unknown): Look {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    exposure: unit(v.exposure),
    contrast: unit(v.contrast),
    saturation: unit(v.saturation),
    warmth: unit(v.warmth),
    shadows: unit(v.shadows),
    highlights: unit(v.highlights),
    sharpen: unit(v.sharpen),
  };
}

type Stats = { low: number; high: number; mean: [number, number, number]; median: number };

/** The darkest and brightest (0.4% cut off at both ends), each channel's average and the middle brightness. */
function measure(data: Uint8ClampedArray): Stats {
  const lowHist = new Uint32Array(256);
  const highHist = new Uint32Array(256);
  const lumaHist = new Uint32Array(256);
  const sum = [0, 0, 0];
  let count = 0;
  // every 4th pixel is plenty
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    lowHist[Math.min(r, g, b)]++;
    highHist[Math.max(r, g, b)]++;
    lumaHist[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    count++;
  }
  const cut = Math.max(1, Math.round(count * 0.004));
  const at = (h: Uint32Array, wanted: number, fromTop = false) => {
    let seen = 0;
    for (let k = 0; k < 256; k++) {
      const v = fromTop ? 255 - k : k;
      seen += h[v];
      if (seen >= wanted) return v / 255;
    }
    return fromTop ? 1 : 0;
  };
  return {
    low: at(lowHist, cut),
    high: at(highHist, cut, true),
    mean: sum.map((s) => s / count / 255) as [number, number, number],
    median: at(lumaHist, count / 2),
  };
}

/** One lookup table per channel: white balance, levels, exposure, shadows / highlights, contrast. */
function toneTables(stats: Stats, look: Look) {
  // white balance: most of the way to neutral grey (a warm room stays a little warm), then the warmth asked
  const grey = (stats.mean[0] + stats.mean[1] + stats.mean[2]) / 3;
  const balance = stats.mean.map((m) => clamp(1 + 0.75 * (grey / Math.max(m, 0.02) - 1), 0.75, 1.35));
  const warmth = [1 + 0.05 * look.warmth + 0.015, 1, 1 - 0.05 * look.warmth - 0.015];

  // levels, the same for every channel (the balance above already set the colour); a nearly
  // empty range isn't stretched all the way — a night shot stays a night shot, a foggy one gets clear
  const low = Math.min(stats.low, 0.12);
  const high = Math.max(stats.high, 0.5);

  // exposure: the middle of the photo (not its average — a bright window would fool that) to a bright, airy level
  const target = clamp(0.5 + 0.08 * look.exposure, 0.35, 0.65);
  const middle = clamp((stats.median - low) / (high - low), 0.03, 0.97);
  // a photo that is already bright is only darkened a little
  const gamma = clamp(Math.log(middle) / Math.log(target), 0.92, 1.8);

  const shadows = 0.3 + 0.3 * look.shadows;
  const highlights = 0.3 + 0.3 * look.highlights;
  const contrast = 0.15 + 0.25 * look.contrast;

  return [0, 1, 2].map((c) => {
    const table = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let y = clamp(((v / 255) * balance[c] * warmth[c] - low) / (high - low));
      y = Math.pow(y, 1 / gamma);
      y += shadows * y * (1 - y) * (1 - y); // open the dark corners
      y -= highlights * y * y * (1 - y); // keep the windows from burning out
      const s = y * y * (3 - 2 * y); // a soft S-curve
      y = clamp(y + contrast * (s - y));
      table[v] = Math.round(y * 255);
    }
    return table;
  });
}

/** The look applied to a canvas, in place. */
export function enhanceCanvas(canvas: HTMLCanvasElement, look: Look = NEUTRAL_LOOK) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const [rT, gT, bT] = toneTables(measure(data), look);
  // vibrance: dull colours gain more than strong ones (skin and wood don't go orange)
  const vibrance = 0.28 + 0.3 * look.saturation;

  for (let i = 0; i < data.length; i += 4) {
    let r = rT[data[i]];
    let g = gT[data[i + 1]];
    let b = bT[data[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const amount = vibrance * (1 - sat);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * (1 + amount);
    g = l + (g - l) * (1 + amount);
    b = l + (b - l) * (1 + amount);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  const sharpen = 0.35 + 0.35 * look.sharpen;
  if (sharpen > 0.02) unsharp(data, width, height, sharpen);
  ctx.putImageData(image, 0, 0);
}

/** A light unsharp mask (3×3): edges a little crisper, flat walls left alone. */
function unsharp(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  const source = new Uint8ClampedArray(data);
  const row = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        const blur =
          (source[k - row - 4] + source[k - row] + source[k - row + 4] + source[k - 4] + source[k] + source[k + 4] + source[k + row - 4] + source[k + row] + source[k + row + 4]) / 9;
        const diff = source[k] - blur;
        // tiny differences are noise — leave them
        if (diff > 3 || diff < -3) data[k] = source[k] + amount * diff;
      }
    }
  }
}

/** A small copy of the photo (for Brix to look at), as base64 JPEG. */
export function thumbnailBase64(canvas: HTMLCanvasElement, edge = 640): string {
  const scale = Math.min(1, edge / Math.max(canvas.width, canvas.height));
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
}
