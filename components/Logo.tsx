export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight text-fg ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
          <path d="M12 3 3 9.5V21h6.5v-6h5v6H21V9.5L12 3Z" />
        </svg>
      </span>
      BRIXA
    </span>
  );
}
