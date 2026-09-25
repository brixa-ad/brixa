import { avatarUrl } from "@/lib/avatar";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
  xl: "size-28 text-4xl",
};

function initialsOf(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Profile photo, or the person's initials when they haven't uploaded one. */
export function Avatar({
  path,
  name,
  size = "md",
  className = "",
}: {
  path: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const url = avatarUrl(path);
  const base = `${SIZES[size]} shrink-0 rounded-full ${className}`;

  if (url) {
    return <img src={url} alt={name} className={`${base} object-cover ring-1 ring-line`} />;
  }

  return (
    <span
      aria-label={name}
      className={`${base} grid place-items-center bg-accent-soft font-semibold text-accent-fg`}
    >
      {initialsOf(name)}
    </span>
  );
}
