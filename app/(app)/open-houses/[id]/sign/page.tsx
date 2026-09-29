import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/PublicPageTools";
import { getAgency } from "@/lib/agency";
import { getI18n } from "@/lib/i18n/server";
import { getOpenHouse, qrSvg, siteOrigin } from "@/lib/open-houses";
import { getSession } from "@/lib/session";
import { personName } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.openHouses.sign };
}

/** A page for the door: a big QR code — visitors sign in on their phones. */
export default async function SignPage({ params }: PageProps<"/open-houses/[id]/sign">) {
  const { id } = await params;
  const [session, house] = await Promise.all([getSession(), getOpenHouse(id)]);
  if (!session || !house?.property) notFound();

  const [{ t }, agency, origin] = await Promise.all([getI18n(), getAgency(house.organization_id), siteOrigin()]);
  const qr = await qrSvg(`${origin}/o/${house.token}`);

  return (
    <div className="stats-page">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/open-houses/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          {t.openHouses.title}
        </Link>
        <PrintButton label={t.openHouses.print} />
      </div>

      <article className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-line bg-surface px-8 py-10 text-center shadow-xs print:max-w-none print:border-0 print:shadow-none">
        {agency?.logoUrl ? (
          <img src={agency.logoUrl} alt={agency.name} className="h-14 max-w-56 rounded-md bg-white object-contain p-1" />
        ) : (
          <p className="text-xl font-bold">{agency?.name}</p>
        )}
        <h1 className="mt-6 text-4xl font-black tracking-tight">{t.openHouses.signHeading}</h1>
        <p className="mt-2 text-lg text-fg-2">{house.property.title}</p>
        <div className="mt-8 w-full max-w-sm rounded-2xl bg-white p-3 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-6 text-2xl font-bold">{t.openHouses.signScan}</p>
        <p className="mt-2 text-lg text-muted">{t.openHouses.signBenefit}</p>
        <p className="mt-8 text-sm text-fg-2">
          {personName(house.host)}
          {house.host?.phone ? ` · ${house.host.phone}` : ""}
        </p>
      </article>
    </div>
  );
}
