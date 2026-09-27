import { Globe, Mail, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PublicPageTools";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { telHref, viberHref, whatsappHref } from "@/lib/phone";

type Broker = { name: string; email: string; phone: string | null; job_title: string | null; avatarUrl: string | null };
type Agency = { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null };

/** The agency's logo (or name) and the PDF button, on top of a public page. */
export function PublicHeader({ agency }: { agency: Agency | null }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-3">
      {agency?.logoUrl ? (
        <img src={agency.logoUrl} alt={agency.name} className="h-10 max-w-44 rounded-md bg-white object-contain p-1" />
      ) : agency ? (
        <span className="text-lg font-bold">{agency.name}</span>
      ) : (
        <Logo />
      )}
      <PrintButton />
    </header>
  );
}

/** Who to call: the broker, with call / Viber / WhatsApp / email. */
export function BrokerCard({ broker, subject, t }: { broker: Broker; subject: string; t: Dictionary }) {
  const button =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold";
  return (
    <section className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
      <h2 className="mb-3 text-sm font-semibold">{t.share.contactBroker}</h2>
      <div className="flex items-center gap-3">
        {broker.avatarUrl ? (
          <img src={broker.avatarUrl} alt={broker.name} className="size-14 rounded-full object-cover" />
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-accent text-lg font-bold text-on-accent">
            {broker.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold">{broker.name}</p>
          {broker.job_title && <p className="text-sm text-muted">{broker.job_title}</p>}
          {broker.phone && <p className="text-sm text-fg-2">{broker.phone}</p>}
          <p className="hidden text-sm text-fg-2 print:block">{broker.email}</p>
        </div>
      </div>
      <div className="no-print mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {broker.phone && (
          <a
            href={telHref(broker.phone)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent"
          >
            <Phone className="size-4" />
            {t.share.call}
          </a>
        )}
        {broker.phone && (
          <a href={viberHref(broker.phone)} className={button}>
            <MessageCircle className="size-4 text-[#7360f2]" />
            Viber
          </a>
        )}
        {broker.phone && (
          <a href={whatsappHref(broker.phone)} className={button}>
            <MessageCircle className="size-4 text-[#25d366]" />
            WhatsApp
          </a>
        )}
        <a href={`mailto:${broker.email}?subject=${encodeURIComponent(subject)}`} className={button}>
          <Mail className="size-4" />
          {t.share.email}
        </a>
      </div>
    </section>
  );
}

/** The agency's name and contacts at the bottom. */
export function AgencyFooter({ agency }: { agency: Agency }) {
  return (
    <footer className="mt-8 space-y-1 border-t border-line pt-5 text-center text-sm text-muted">
      <p className="font-semibold text-fg-2">{agency.name}</p>
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {agency.phone && (
          <a href={telHref(agency.phone)} className="inline-flex items-center gap-1 hover:text-fg">
            <Phone className="size-3.5" />
            {agency.phone}
          </a>
        )}
        {agency.email && (
          <a href={`mailto:${agency.email}`} className="inline-flex items-center gap-1 hover:text-fg">
            <Mail className="size-3.5" />
            {agency.email}
          </a>
        )}
        {agency.website && (
          <a href={agency.website} className="inline-flex items-center gap-1 hover:text-fg" target="_blank" rel="noopener noreferrer">
            <Globe className="size-3.5" />
            {agency.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </p>
    </footer>
  );
}
