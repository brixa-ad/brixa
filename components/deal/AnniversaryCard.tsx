"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Printer, Share2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

export type CardData = {
  agency: string;
  logoUrl: string | null;
  photoUrl: string | null;
  heading: string;
  years: string;
  since: string;
  growthPct: number | null;
  growthLabel: string;
  growthHint: string;
  value: string | null;
  thanks: string;
  broker: string;
  brokerLine: string;
  avatarUrl: string | null;
};

// a transparent pixel, when an image can't be read into the picture
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The anniversary card in the brand's colours (portrait, like a phone photo): the home, the years,
 * how much it's worth now, who greets. Sent as an image (Viber, WhatsApp…), saved, or printed as a PDF.
 */
export function AnniversaryCard({ card, fileName, shareText }: { card: CardData; fileName: string; shareText: string }) {
  const { t } = useI18n();
  const node = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  async function image() {
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(node.current!, { pixelRatio: 2, cacheBust: true, imagePlaceholder: BLANK, backgroundColor: "#040915" });
    if (!blob) throw new Error("no image");
    return new File([blob], `${fileName}.png`, { type: "image/png" });
  }

  function save(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function run(kind: "share" | "download") {
    setBusy(kind);
    try {
      const file = await image();
      if (kind === "share" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText }).catch(() => {});
      } else {
        save(file);
      }
    } catch (error) {
      console.error("Making the card failed:", error);
      window.alert(t.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[540px]">
        <div
          ref={node}
          className="relative w-full rounded-3xl [container-type:inline-size] print:rounded-none"
          style={{
            background:
              "radial-gradient(60% 45% at 100% 0%, rgba(37,99,255,0.55), transparent 70%), radial-gradient(55% 40% at 0% 100%, rgba(56,200,255,0.35), transparent 70%), #040915",
            color: "#ffffff",
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          }}
        >
          <div className="flex flex-col" style={{ padding: "6cqw", gap: "3.2cqw" }}>
            {/* the agency */}
            <div className="flex items-center justify-between">
              {card.logoUrl ? (
                <img src={card.logoUrl} crossOrigin="anonymous" alt="" style={{ height: "8cqw", maxWidth: "38cqw", objectFit: "contain", background: "#fff", borderRadius: "1.6cqw", padding: "0.8cqw" }} />
              ) : (
                <span style={{ fontSize: "4.2cqw", fontWeight: 700 }}>{card.agency}</span>
              )}
              <span style={{ fontSize: "3cqw", fontWeight: 700, color: "#38c8ff", letterSpacing: "0.04em" }}>{card.years}</span>
            </div>

            {/* the home */}
            {card.photoUrl && (
              <img
                src={card.photoUrl}
                crossOrigin="anonymous"
                alt=""
                style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "3cqw", border: "0.4cqw solid rgba(255,255,255,0.15)" }}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "2.4cqw", paddingTop: "1cqw" }}>
              <p style={{ fontSize: "9cqw", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{card.heading}</p>
              <p style={{ fontSize: "4cqw", lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>{card.since}</p>

              {card.growthPct !== null && (
                <div className="flex items-center" style={{ gap: "3cqw", marginTop: "1cqw" }}>
                  <span
                    style={{
                      fontSize: "8cqw",
                      fontWeight: 800,
                      color: "#040915",
                      background: "linear-gradient(135deg, #38c8ff, #2563ff)",
                      borderRadius: "2.4cqw",
                      padding: "0.6cqw 2.6cqw",
                    }}
                  >
                    +{card.growthPct}%
                  </span>
                  <span style={{ fontSize: "3.4cqw", lineHeight: 1.3 }}>
                    <span style={{ display: "block", fontWeight: 700 }}>{card.growthLabel}</span>
                    <span style={{ display: "block", color: "rgba(255,255,255,0.65)" }}>{card.value ?? card.growthHint}</span>
                  </span>
                </div>
              )}
            </div>

            <p style={{ fontSize: "4.4cqw", fontWeight: 700, color: "#38c8ff" }}>{card.thanks}</p>

            {/* who greets */}
            <div className="flex items-center" style={{ gap: "3cqw", borderTop: "0.3cqw solid rgba(255,255,255,0.15)", paddingTop: "3cqw" }}>
              {card.avatarUrl ? (
                <img src={card.avatarUrl} crossOrigin="anonymous" alt="" style={{ width: "11cqw", height: "11cqw", borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span
                  className="grid place-items-center"
                  style={{ width: "11cqw", height: "11cqw", borderRadius: "50%", background: "#2563ff", fontSize: "5cqw", fontWeight: 800 }}
                >
                  {card.broker.slice(0, 1)}
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "4.2cqw", fontWeight: 700 }}>{card.broker}</span>
                <span style={{ display: "block", fontSize: "3.2cqw", color: "rgba(255,255,255,0.7)" }}>{card.brokerLine}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <button type="button" onClick={() => run("share")} disabled={busy !== null} className={buttonClass.primary}>
          {busy === "share" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          {busy === "share" ? t.anniversary.making : t.anniversary.share}
        </button>
        <button type="button" onClick={() => run("download")} disabled={busy !== null} className={buttonClass.secondary}>
          {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {t.anniversary.download}
        </button>
        <button type="button" onClick={() => window.print()} className={buttonClass.secondary}>
          <Printer className="size-4" />
          {t.anniversary.print}
        </button>
      </div>
    </div>
  );
}
