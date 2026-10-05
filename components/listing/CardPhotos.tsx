"use client";

import Link from "next/link";
import { useState } from "react";
import { ImageIcon } from "lucide-react";

/** A listing card's photos: swipe through them (dots under), tap to open the listing; the badges on top. */
export function CardPhotos({ href, urls, alt, overlay }: { href: string; urls: string[]; alt: string; overlay?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const dots = Math.min(urls.length, 5);
  return (
    <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-raised">
      {urls.length === 0 ? (
        <span className="grid size-full place-items-center text-faint">
          <ImageIcon className="size-8" />
        </span>
      ) : (
        <span
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        >
          {urls.map((url, i) => (
            <img key={url} src={url} alt={i === 0 ? alt : ""} loading={i === 0 ? "eager" : "lazy"} className="size-full shrink-0 snap-center object-cover" />
          ))}
        </span>
      )}
      {overlay}
      {dots > 1 && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className={`size-1.5 rounded-full transition ${i === Math.min(index, dots - 1) ? "bg-white" : "bg-white/50"}`} />
          ))}
        </span>
      )}
    </Link>
  );
}
