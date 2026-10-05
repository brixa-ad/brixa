import Link from "next/link";
import { Building2, EyeOff, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/property/StatusBadge";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { telHref, whatsappHref } from "@/lib/phone";
import type { Stars } from "@/lib/rating";
import { CardPhotos } from "./CardPhotos";
import { StarRating } from "./StarRating";

export type ListingCardData = {
  href: string;
  photos: string[];
  title: string;
  /** the neighbourhood (and town) */
  place: string | null;
  price: string;
  perMonth: boolean;
  /** "Двустаен", "3 стаи", "72 м²"… */
  specs: string[];
  /** shown on the photo unless on the market */
  status: { code: string; label: string } | null;
  exclusive: boolean;
  offMarket: boolean;
  broker: { name: string; avatarPath?: string | null; level?: string | null } | null;
  /** "3 days ago" */
  age?: string | null;
  /** whom the two buttons reach (the broker; on my own listings, the owner) */
  phone: string | null;
  /** how the price stands on the market */
  rating?: { stars: Stars; label: string; title: string } | null;
};

/** A listing, the way the portals show it: the photos with the broker on them, the price, what it is, call / WhatsApp. */
export function ListingCard({ data, t }: { data: ListingCardData; t: Dictionary }) {
  const pill = "rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur";
  return (
    <article className="min-w-0 overflow-hidden rounded-3xl border border-line bg-surface shadow-xs transition hover:border-line-strong hover:shadow-lg hover:shadow-black/30">
      <CardPhotos
        href={data.href}
        urls={data.photos}
        alt={data.title}
        overlay={
          <>
            {data.broker && (
              <span className="absolute left-3 top-3 flex max-w-[72%] items-center gap-2 rounded-full bg-black/60 py-1 pl-1 pr-3 text-white backdrop-blur">
                <Avatar path={data.broker.avatarPath} name={data.broker.name} size="sm" className="ring-2! ring-white/80" />
                <span className="min-w-0 leading-tight">
                  {data.broker.level && <span className="block truncate text-[11px] font-semibold text-sky-300">{data.broker.level}</span>}
                  <span className="block truncate text-sm font-semibold">{data.broker.name}</span>
                </span>
              </span>
            )}
            <span className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
              {data.status && <StatusBadge status={data.status.code} label={data.status.label} />}
              {data.exclusive && (
                <span className={`${pill} inline-flex items-center gap-1 text-amber-300`}>
                  <ShieldCheck className="size-3" />
                  {t.detail.exclusive}
                </span>
              )}
              {data.offMarket && (
                <span className={`${pill} inline-flex items-center gap-1`}>
                  <EyeOff className="size-3" />
                  {t.menu.tabs.offMarketProperties}
                </span>
              )}
            </span>
            {data.age && <span className={`${pill} absolute bottom-3 left-3 font-medium`}>{data.age}</span>}
          </>
        }
      />
      <div className="p-4">
        <Link href={data.href} className="block">
          <p className="text-xl font-bold tracking-tight">
            {data.price}
            {data.perMonth && <span className="ml-1 text-sm font-medium text-muted">{t.listing.perMonth}</span>}
          </p>
          {data.rating && <StarRating stars={data.rating.stars} label={data.rating.label} title={data.rating.title} size="sm" className="mt-1" />}
          <p className="mt-1 truncate font-semibold">
            {data.title}
            {data.place && <span className="font-normal text-muted"> | {data.place}</span>}
          </p>
          {data.specs.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-2">
              <Building2 className="size-4 shrink-0 text-muted" />
              <span className="truncate">{data.specs.join(" · ")}</span>
            </p>
          )}
        </Link>
        {data.phone && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={telHref(data.phone)} className="inline-flex items-center justify-center gap-2 rounded-full bg-raised py-2.5 text-sm font-semibold transition hover:bg-overlay">
              <Phone className="size-4" />
              {t.listing.call}
            </a>
            <a
              href={whatsappHref(data.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-raised py-2.5 text-sm font-semibold transition hover:bg-overlay"
            >
              <MessageCircle className="size-4 text-[#25d366]" />
              WhatsApp
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
