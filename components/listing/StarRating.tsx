import { Star } from "lucide-react";
import type { Stars } from "@/lib/rating";

const SIZES = { sm: "size-3.5", md: "size-4.5", lg: "size-6" } as const;
const TONES: Record<Stars, string> = {
  5: "text-success",
  4: "text-success",
  3: "text-fg-2",
  2: "text-warning",
  1: "text-danger",
};

/** Five stars, the filled ones in gold, and what they mean ("Отлично предложение" … "Надценен имот"). */
export function StarRating({
  stars,
  label,
  title,
  size = "md",
  className = "",
}: {
  stars: Stars;
  label?: string;
  /** read aloud and on hover: "4 от 5 звезди" */
  title: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={title}>
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={title}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`${SIZES[size]} ${n <= stars ? "fill-[#f5b301] text-[#f5b301]" : "fill-transparent text-faint"}`}
            strokeWidth={1.75}
          />
        ))}
      </span>
      {label && <span className={`font-semibold ${size === "sm" ? "text-xs" : "text-sm"} ${TONES[stars]}`}>{label}</span>}
    </span>
  );
}
