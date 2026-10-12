import type { Metadata } from "next";
import { Banknote, Building2, Clock, FileCheck2, Globe, Landmark, MapPin, Phone, Scale, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MessageSender } from "@/components/program/MessageSender";
import { SaleDocsFilters } from "@/components/saledocs/SaleDocsFilters";
import { Card } from "@/components/ui/form";
import { getAgency } from "@/lib/agency";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { SALE_ISSUERS, docsFor, isOfficeKind, isSaleCase, mapHref, type SaleDoc, type SaleIssuer, type SaleOffice } from "@/lib/sale-docs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.saleDocs.title };
}

const ICONS: Record<SaleIssuer, typeof Building2> = {
  owner: UserRound,
  municipality: Building2,
  cadastre: MapPin,
  registry: Landmark,
  bank: Banknote,
  notary: Scale,
  other: FileCheck2,
};

/** What a sale needs: each document, who issues it, the office in the city, the fee and how long it takes. */
export default async function SaleDocumentsPage({ searchParams }: PageProps<"/sale-documents">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, { data: docRows }, { data: officeRows }, agency] = await Promise.all([
    getI18n(),
    supabase.from("sale_docs").select("*").order("sort"),
    supabase.from("sale_offices").select("*").order("city"),
    getAgency(session.organizationId),
  ]);
  const docs = (docRows ?? []) as SaleDoc[];
  const offices = (officeRows ?? []) as SaleOffice[];
  const cities = [...new Set(offices.map((o) => o.city))].sort((a, b) => a.localeCompare(b, "bg"));

  // the city: as picked, else the agency's (when BRIXA knows its offices), else the first
  const agencyCity = agency?.city?.replace(/^гр\.\s*/, "").trim() ?? "";
  const city =
    typeof params.city === "string" && (params.city === "other" || cities.includes(params.city))
      ? params.city
      : cities.includes(agencyCity)
        ? agencyCity
        : cities.includes("София")
          ? "София"
          : (cities[0] ?? "other");
  const cases = (typeof params.cases === "string" ? params.cases.split(",") : []).filter(isSaleCase);

  const list = docsFor(docs, cases);
  const office = (kind: string) => (city === "other" ? null : (offices.find((o) => o.city === city && o.kind === kind) ?? null));
  const groups = SALE_ISSUERS.map((issuer) => ({ issuer, docs: list.filter((d) => d.issuer === issuer) })).filter((g) => g.docs.length > 0);
  const updated = [...docs.map((d) => d.updated_at), ...offices.map((o) => o.updated_at)].sort().at(-1);

  // what the owner gets to prepare (the notary's papers are made at the deal)
  const message = [
    t.saleDocs.messageIntro,
    ...list.filter((d) => d.issuer !== "notary").map((d) => `• ${d.title}`),
    t.saleDocs.messageOutro,
  ].join("\n");

  return (
    <>
      <PageHeader title={t.saleDocs.title} subtitle={t.saleDocs.subtitle} />

      <Card>
        <SaleDocsFilters cities={cities} city={city} cases={cases} />
      </Card>

      <div className="mt-6 space-y-6">
        {groups.map(({ issuer, docs: items }) => {
          const Icon = ICONS[issuer];
          const where = isOfficeKind(issuer) ? office(issuer) : null;
          return (
            <section key={issuer} className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Icon className="size-5 text-brand-cyan" />
                {t.saleDocs.groups[issuer]}
              </h2>

              {/* the office in this city (or where to go, for another place) */}
              {isOfficeKind(issuer) && (
                <div className="mt-3 rounded-xl bg-raised/60 p-3 text-sm">
                  {where ? (
                    <>
                      <p className="font-semibold">{where.name}</p>
                      {where.address && (
                        <a href={mapHref(where.address)} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1.5 text-fg-2 hover:text-accent-fg">
                          <MapPin className="mt-0.5 size-4 shrink-0" />
                          {where.address}
                        </a>
                      )}
                      {where.phone && (
                        <a href={`tel:${where.phone.replace(/[^\d+]/g, "")}`} className="mt-1 flex items-center gap-1.5 text-fg-2 hover:text-accent-fg">
                          <Phone className="size-4 shrink-0" />
                          {where.phone}
                        </a>
                      )}
                      {!where.address && !where.phone && <p className="mt-1 text-muted">{t.saleDocs.noAddress}</p>}
                    </>
                  ) : (
                    <p className="text-fg-2">{t.saleDocs.elsewhere[issuer]}</p>
                  )}
                </div>
              )}

              <ul className="mt-3 divide-y divide-line-soft">
                {items.map((d) => {
                  // the municipality's own fee and time for the tax valuation
                  const own = d.code === "tax_valuation" ? where : null;
                  const fee = own?.fee ?? d.fee;
                  const term = own?.term ?? d.term;
                  return (
                    <li key={d.code} className="py-3 first:pt-1 last:pb-0">
                      <p className="font-medium">{d.title}</p>
                      {d.about && <p className="mt-1 text-sm leading-relaxed text-fg-2">{d.about}</p>}
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                        {fee && (
                          <div className="flex gap-1.5">
                            <dt className="shrink-0 text-muted">{t.saleDocs.fee}:</dt>
                            <dd className="font-medium">{fee}</dd>
                          </div>
                        )}
                        {term && (
                          <div className="flex gap-1.5">
                            <dt className="flex shrink-0 items-center gap-1 text-muted">
                              <Clock className="size-3.5" />
                              {t.saleDocs.term}:
                            </dt>
                            <dd className="font-medium">{term}</dd>
                          </div>
                        )}
                        {d.validity && (
                          <div className="flex gap-1.5 sm:col-span-2">
                            <dt className="flex shrink-0 items-center gap-1 text-muted">
                              <ShieldCheck className="size-3.5" />
                              {t.saleDocs.validity}:
                            </dt>
                            <dd>{d.validity}</dd>
                          </div>
                        )}
                        {d.online && (
                          <div className="flex gap-1.5 sm:col-span-2">
                            <dt className="flex shrink-0 items-center gap-1 text-muted">
                              <Globe className="size-3.5" />
                              {t.saleDocs.online}:
                            </dt>
                            <dd>{d.online}</dd>
                          </div>
                        )}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/* the list for the owner, to copy or send */}
        <Card title={t.saleDocs.sendTitle} description={t.saleDocs.sendHint}>
          <MessageSender text={message} phone={null} email={null} />
        </Card>

        <p className="text-xs text-muted">{fmt(t.saleDocs.sources, { date: updated ? formatDate(updated, lang) : "—" })}</p>
      </div>
    </>
  );
}
