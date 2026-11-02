import type { Metadata } from "next";
import { BadgeCheck, CircleAlert, SearchX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { levelName } from "@/lib/academy";
import { logoUrl } from "@/lib/agency";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { anonymous } from "@/lib/share";

type PublicCertificate = {
  number: number;
  holder: string;
  agency: string;
  level: number;
  score: number;
  issued_on: string;
  valid_until: string;
  valid: boolean;
  logo_path: string | null;
};

async function getCertificate(code: string) {
  if (!/^[0-9a-f]{12}$/i.test(code)) return null;
  const { data } = await anonymous().rpc("academy_certificate_public", { cert_code: code });
  return (data as PublicCertificate | null) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: `${t.academy.verify.title} · BRIXA` }, robots: { index: false, follow: false } };
}

/** What the QR code on a certificate opens: is it genuine, and still valid — for anyone with the code. */
export default async function CertificateCheckPage({ params }: PageProps<"/v/[code]">) {
  const { code } = await params;
  const [certificate, { t, lang }] = await Promise.all([getCertificate(code), getI18n()]);
  const V = t.academy.verify;
  const logo = logoUrl(certificate?.logo_path);

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        {logo ? <img src={logo} alt={certificate?.agency ?? ""} className="h-10 max-w-44 rounded-md bg-white object-contain p-1" /> : <Logo className="h-6 w-auto" />}
        <span className="text-sm font-medium text-muted">{V.title}</span>
      </header>

      {!certificate ? (
        <section className="rounded-2xl border border-line bg-surface p-6 text-center shadow-xs">
          <SearchX className="mx-auto size-10 text-faint" />
          <h1 className="mt-3 text-lg font-semibold">{V.notFound}</h1>
          <p className="mt-1 text-sm text-muted">{V.notFoundHint}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${certificate.valid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            {certificate.valid ? <BadgeCheck className="size-6 shrink-0" /> : <CircleAlert className="size-6 shrink-0" />}
            <h1 className="font-semibold">{certificate.valid ? V.valid : V.expired}</h1>
          </div>
          <dl className="mt-5 divide-y divide-line-soft text-sm">
            {[
              [V.holder, certificate.holder],
              [V.agency, certificate.agency],
              [V.level, levelName(certificate.level, t)],
              [V.score, `${certificate.score}%`],
              [V.issued, formatDate(certificate.issued_on, lang)],
              [V.validUntil, formatDate(certificate.valid_until, lang)],
              [V.number, String(certificate.number).padStart(5, "0")],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-center text-xs text-muted">{V.by}</p>
        </section>
      )}
    </main>
  );
}
