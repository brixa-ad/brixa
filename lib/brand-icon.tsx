import { ImageResponse } from "next/og";
import { LOGO_PATHS } from "@/components/Logo";

/**
 * The BRIXA app icon: the logo's X (white strokes + blue→cyan accent) on the logo's
 * deep navy with a blue glow. Full-bleed so iOS/Android round the corners themselves;
 * the mark stays inside the maskable-icon safe zone.
 */
export function brandIcon(size: number) {
  const mark = Math.round(size * 0.5);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 0% 0%, #1d4ed8 0%, rgba(29,78,216,0) 55%), radial-gradient(circle at 100% 100%, #1d4ed8 0%, rgba(29,78,216,0) 55%), #040915",
        }}
      >
        <svg width={mark} height={Math.round(mark * (100 / 134))} viewBox="347 0 134 100">
          <defs>
            <linearGradient id="accent" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#1f5cff" />
              <stop offset="1" stopColor="#1fe0ff" />
            </linearGradient>
          </defs>
          <path d={LOGO_PATHS.xBack} fill="#ffffff" />
          <path d={LOGO_PATHS.xFront} fill="#ffffff" />
          <path d={LOGO_PATHS.xAccent} fill="url(#accent)" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
