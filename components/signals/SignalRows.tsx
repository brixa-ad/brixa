import Link from "next/link";
import { Eye, MousePointerClick } from "lucide-react";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ContactButtons } from "@/components/ContactButtons";
import { TemperatureBadge } from "@/components/signals/TemperatureBadge";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { ago, reasonText } from "@/lib/signals";
import type { LinkActivity, TemperatureRow } from "@/lib/signals-server";

/** A client with their temperature and why — and call / Viber / e-mail right there. */
export function TemperatureItem({
  row,
  t,
  lang,
  showBroker = false,
  reasons = 3,
}: {
  row: TemperatureRow;
  t: Dictionary;
  lang: Lang;
  showBroker?: boolean;
  reasons?: number;
}) {
  const { client } = row;
  return (
    <li className="flex items-start gap-3 py-3">
      <TemperatureBadge value={row.temperature} t={t} compact />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/clients/${client.id}`} className="truncate font-medium hover:text-accent-fg">
            {client.full_name}
          </Link>
          <span className="text-xs font-semibold text-subtle">{client.client_class}</span>
          {showBroker && client.brokerName && <span className="truncate text-xs text-muted">· {client.brokerName}</span>}
        </p>
        {row.reasons.length > 0 && (
          <ul className="mt-0.5 space-y-0.5 text-xs text-fg-2">
            {row.reasons.slice(0, reasons).map((reason, i) => (
              <li key={i}>• {reasonText(reason, t, lang)}</li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-subtle">
          {row.lastContactAt ? fmt(t.signals.lastContact, { when: ago(row.lastContactAt, lang) }) : t.signals.noContact}
        </p>
      </div>
      <div className="shrink-0">
        <ContactButtons phone={client.phone} email={client.email} clientId={client.id} compact />
      </div>
    </li>
  );
}

/** Who opened which listing, how often, for how long — and what they tapped. */
export function LinkActivityItem({ item, t, lang, showBroker = false }: { item: LinkActivity; t: Dictionary; lang: Lang; showBroker?: boolean }) {
  const { client } = item;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <ClassBadge value={client.client_class} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/clients/${client.id}`} className="truncate font-medium hover:text-accent-fg">
              {client.full_name}
            </Link>
            {showBroker && client.brokerName && <span className="truncate text-xs text-muted">· {client.brokerName}</span>}
            <span className="text-xs text-subtle">{ago(item.last, lang)}</span>
          </p>
          {item.taps.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {item.taps.map((tap) => (
                <span key={tap} className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                  <MousePointerClick className="size-3" />
                  {fmt(t.signals.tapped, { button: t.signals.buttons[tap] })}
                </span>
              ))}
            </p>
          )}
          <ul className="mt-1 space-y-1">
            {item.listings.map((listing) => (
              <li key={listing.id ?? "none"} className="flex items-start gap-1.5 text-xs text-fg-2">
                <Eye className="mt-0.5 size-3 shrink-0 text-subtle" />
                <span className="min-w-0">
                  {listing.id ? (
                    <Link href={`/properties/${listing.id}`} className="font-medium hover:text-accent-fg">
                      {listing.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{listing.title}</span>
                  )}
                  <span className="text-muted">
                    {" · "}
                    {[
                      fmt(t.signals.opens, { n: listing.opens }),
                      listing.seconds >= 30 ? fmt(t.signals.minutes, { n: Math.max(1, Math.round(listing.seconds / 60)) }) : null,
                      listing.photos > 0 ? fmt(t.signals.photos, { n: listing.photos }) : null,
                      fmt(t.signals.last, { when: ago(listing.last, lang) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0">
          <ContactButtons phone={client.phone} email={client.email} clientId={client.id} compact />
        </div>
      </div>
    </li>
  );
}
