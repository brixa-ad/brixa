/**
 * The BRIXA wordmark, redrawn as vector paths from the brand logo: geometric letters,
 * the "A" without a crossbar, and the electric-blue → cyan accent on the X.
 * Letters use currentColor, so they're white on dark and navy on light.
 */
export const LOGO_PATHS = {
  b: "M0 0H98A24 24 0 0 1 98 48H104A26 26 0 0 1 104 100H0Z M28 22H92A9 9 0 0 1 92 40H28Z M28 60H100A9 9 0 0 1 100 78H28Z",
  r: "M152 0H250A26 26 0 0 1 250 52H180V100H152Z M180 20H244A9 9 0 0 1 244 38H180Z",
  rLeg: "M206 52H240L282 100H248Z",
  i: "M300 0H328V100H300Z",
  xBack: "M347 0H375L481 100H453Z",
  xFront: "M347 100H375L428 50H400Z",
  xAccent: "M453 0H481L443 36H415Z",
  a: "M487 100L545 0H573L631 100H599L559 31L519 100Z",
};

export function AccentGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stopColor="#1f5cff" />
      <stop offset="1" stopColor="#1fe0ff" />
    </linearGradient>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 632 100"
      role="img"
      aria-label="BRIXA"
      className={`h-5 w-auto text-fg ${className}`}
    >
      <defs>
        <AccentGradient id="brixa-logo-accent" />
      </defs>
      <g fill="currentColor">
        <path fillRule="evenodd" d={LOGO_PATHS.b} />
        <path fillRule="evenodd" d={LOGO_PATHS.r} />
        <path d={LOGO_PATHS.rLeg} />
        <path d={LOGO_PATHS.i} />
        <path d={LOGO_PATHS.xBack} />
        <path d={LOGO_PATHS.xFront} />
        <path d={LOGO_PATHS.a} />
      </g>
      <path d={LOGO_PATHS.xAccent} fill="url(#brixa-logo-accent)" />
    </svg>
  );
}
