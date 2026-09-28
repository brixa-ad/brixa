import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Mail, MessageCircle, Phone, Plus, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PartnerSearchActions } from "@/components/partner/PartnerSearchActions";
import { buttonClass } from "@/components/ui/form";
import { searchFromRow } from "@/lib/clients";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { findMatches } from "@/lib/matching";
import { telHref, viberHref } from "@/lib/phone";
import { describeSearch } from "@/lib/search-describe";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.partnerSearches.title };
}

type Row = {
  id: string;
  broker_name: string;
  agency: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  creator: { full_name: string | null; email: string } | null;
} & Parameters<typeof searchFromRow>[0];

/** Other agencies' buyers, and which of our listings fit them. */
export default async function PartnerSearchesPage({ searchParams }: PageProps<"/partner-searches">) {
  const closed = (await searchParams).closed === "1";
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, { data }] = await Promise.all([
    getI18n(),
    supabase
      .from("partner_searches")
      .select("*, creator:profiles(full_name, email)")
      .eq("organization_id", session.organizationId)
      .eq("active", !closed)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  const cards = await Promise.all(
    rows.map(async (row) => {
      const search = searchFromRow(row)!;
      const [lines, matches] = await Promise.all([
        describeSearch(search, t, lang),
        closed ? Promise.resolve([]) : findMatches(supabase, session.organizationId, search),
      ]);
      return { row, lines, matches };
    })
  );

  return (
    <>
      <PageHeader
        title={t.partnerSearches.title}
        subtitle={t.partnerSearches.subtitle}
        actions={
          <Link href="/partner-searches/new" className={buttonClass.primary}>
            <Plus className="size-4" />
            {t.partnerSearches.new}
          </Link>
        }
      />

      <nav className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-80">
        {[
          [false, t.partnerSearches.active, "/partner-searches"],
          [true, t.partnerSearches.closed, "/partner-searches?closed=1"],
        ].map(([isClosed, label, href]) => (
          <Link
            key={String(isClosed)}
            href={href as string}
            aria-current={closed === isClosed ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              closed === isClosed ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {label as string}
          </Link>
        ))}
      </nav>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <UserSearch className="mx-auto size-10 text-faint" />
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">{t.partnerSearches.empty}</p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map(({ row, lines, matches }) => {
            const mine = row.created_by === session.userId || session.isManager;
            return (
              <li key={row.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.broker_name}</p>
                    {row.agency && <p className="truncate text-sm text-muted">{row.agency}</p>}
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      {row.phone && (
                        <>
                          <a href={telHref(row.phone)} className="inline-flex items-center gap-1 text-accent-fg hover:underline">
                            <Phone className="size-3.5" />
                            {row.phone}
                          </a>
                          <a href={viberHref(row.phone)} className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
                            <MessageCircle className="size-3.5 text-[#7360f2]" />
                            Viber
                          </a>
                        </>
                      )}
                      {row.email && (
                        <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
                          <Mail className="size-3.5" />
                          {row.email}
                        </a>
                      )}
                    </p>
                  </div>
                  {mine && <PartnerSearchActions id={row.id} active={row.active} />}
                </div>

                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {lines.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {row.note && <p className="whitespace-pre-line text-sm text-fg-2">{row.note}</p>}

                {!closed && (
                  <div className="rounded-xl bg-raised/60 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Building2 className="size-4 text-accent-fg" />
                      {fmt(t.partnerSearches.matches, { count: matches.length })}
                    </p>
                    {matches.length === 0 ? (
                      <p className="text-xs text-muted">{t.partnerSearches.noMatches}</p>
                    ) : (
                      <ul className="space-y-1">
                        {matches.slice(0, 5).map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                            <Link href={`/properties/${m.id}`} className="min-w-0 truncate hover:text-accent-fg">
                              {m.title}
                            </Link>
                            <span className="shrink-0 tabular-nums text-muted">{formatPrice(m.price, m.currency, lang) ?? "—"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <p className="mt-auto text-xs text-subtle">
                  {fmt(t.partnerSearches.addedBy, {
                    name: row.creator ? personName(row.creator) : "—",
                    date: formatDate(row.created_at, lang),
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
