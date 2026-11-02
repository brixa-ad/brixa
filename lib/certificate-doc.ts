import "server-only";
import QRCode from "qrcode";
import { levelName, type AcademyCertificate } from "./academy";
import { pdfImage } from "./analysis-doc";
import { fmt, locale, type Dictionary, type Lang } from "./i18n/dictionaries";
import { CertificatePdf } from "./pdf/certificate-pdf";
import { renderPdf } from "./pdf/render";

/** "2 ноември 2026 г." */
const longDate = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** The certificate as an A4 PDF; its QR code opens `checkUrl` (the public check of its code). */
export async function renderCertificatePdf(
  certificate: AcademyCertificate,
  agency: { name: string; logoUrl: string | null },
  checkUrl: string,
  questions: number,
  t: Dictionary,
  lang: Lang
): Promise<Buffer> {
  const P = t.academy.pdf;
  const [logo, qr] = await Promise.all([
    pdfImage(agency.logoUrl),
    QRCode.toBuffer(checkUrl, { type: "png", margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#0a1330", light: "#ffffff" } }),
  ]);
  const level = levelName(certificate.level, t);

  return renderPdf(
    CertificatePdf({
      docTitle: fmt(P.file, { name: certificate.holder_name }),
      agency: { name: certificate.agency_name || agency.name, logo },
      holder: certificate.holder_name,
      qr,
      texts: {
        academy: P.academy,
        title: P.title,
        certifies: P.certifies,
        passed: P.passed,
        level: level.toLocaleUpperCase(locale(lang)),
        score: fmt(P.score, { score: certificate.score, count: questions }),
        topics: P.topics,
        issued: fmt(P.issued, { date: longDate(certificate.issued_on, lang) }),
        validUntil: fmt(P.validUntil, { date: longDate(certificate.valid_until, lang) }),
        number: fmt(P.number, { number: String(certificate.number).padStart(5, "0") }),
        // the agency's owner signs; their own certificate (or working alone) carries the academy's name
        signer: certificate.signer_name,
        signerRole: certificate.signer_name ? fmt(P.signer, { agency: certificate.agency_name }) : P.brixa,
        check: fmt(P.check, { url: checkUrl.replace(/^https?:\/\//, "") }),
        code: fmt(P.code, { code: certificate.code }),
        seal: t.academy.levelShort[certificate.level - 1].toLocaleUpperCase(locale(lang)),
      },
    })
  );
}
