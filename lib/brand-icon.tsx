import { ImageResponse } from "next/og";

/**
 * The BRIXA app icon: the house mark on emerald, full-bleed so iOS/Android can round
 * the corners themselves. The house stays inside the maskable-icon safe zone.
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
          background: "#10b981",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 24 24" fill="#03140d">
          <path d="M12 3 3 9.5V21h6.5v-6h5v6H21V9.5L12 3Z" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
