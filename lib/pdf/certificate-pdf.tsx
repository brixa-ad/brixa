import "server-only";
import { Document, Image as Picture, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
// the fonts (Inter, with Cyrillic and №) are registered there
import "./analysis-pdf";
import type { PdfImage } from "./analysis-pdf";

const C = {
  ink: "#0a1330",
  body: "#334063",
  muted: "#5d6a8a",
  line: "#dde3ee",
  accent: "#1d4ed8",
  cyan: "#1fb8e0",
  gold: "#c99a06",
  goldSoft: "#fbf3d5",
  paper: "#fdfdfb",
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", color: C.body, backgroundColor: C.paper, padding: 22 },
  frame: { flex: 1, borderWidth: 3, borderColor: C.ink, padding: 6 },
  inner: { flex: 1, borderWidth: 1, borderColor: C.gold, paddingVertical: 26, paddingHorizontal: 44, alignItems: "center" },
  head: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 38, maxWidth: 170, objectFit: "contain" },
  agency: { fontSize: 14, fontWeight: 700, color: C.ink },
  academy: { fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: 2.4 },
  bar: { flexDirection: "row", marginTop: 4, alignSelf: "flex-end" },
  barBlue: { width: 34, height: 3, backgroundColor: C.accent },
  barCyan: { width: 14, height: 3, backgroundColor: C.cyan },
  title: { marginTop: 22, fontSize: 40, fontWeight: 700, color: C.ink, letterSpacing: 8 },
  rule: { marginTop: 8, width: 90, height: 2, backgroundColor: C.gold },
  certifies: { marginTop: 18, fontSize: 12, color: C.muted },
  holder: { marginTop: 8, fontSize: 30, fontWeight: 700, color: C.accent, textAlign: "center" },
  holderLine: { marginTop: 6, width: 380, height: 1, backgroundColor: C.line },
  passed: { marginTop: 14, fontSize: 12, color: C.body, textAlign: "center" },
  level: { marginTop: 6, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: 2.4 },
  score: { marginTop: 8, fontSize: 11, color: C.body },
  topics: { marginTop: 6, fontSize: 8, color: C.muted, textAlign: "center", maxWidth: 560 },
  foot: { marginTop: "auto", width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  facts: { width: 210 },
  fact: { fontSize: 9, color: C.body, marginTop: 3 },
  factStrong: { fontSize: 9, fontWeight: 700, color: C.ink, marginTop: 3 },
  sign: { width: 220, alignItems: "center" },
  seal: {
    marginTop: 18,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: C.gold,
    backgroundColor: C.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sealTop: { fontSize: 6.5, fontWeight: 700, color: C.gold, letterSpacing: 1.4 },
  sealLevel: { fontSize: 8, fontWeight: 700, color: C.ink, marginTop: 2, textAlign: "center" },
  // room above the line for the signature by hand
  signLine: { marginTop: 34, width: 200, height: 1, backgroundColor: C.ink },
  signer: { marginTop: 4, fontSize: 10, fontWeight: 600, color: C.ink, textAlign: "center" },
  signerRole: { marginTop: 1, fontSize: 8, color: C.muted, textAlign: "center" },
  check: { width: 210, alignItems: "flex-end" },
  qr: { width: 72, height: 72 },
  checkText: { marginTop: 4, fontSize: 7, color: C.muted, textAlign: "right" },
  code: { marginTop: 1, fontSize: 8, fontWeight: 700, color: C.ink, letterSpacing: 1 },
});

export type CertificatePdfProps = {
  docTitle: string;
  agency: { name: string; logo: PdfImage };
  texts: {
    academy: string;
    title: string;
    certifies: string;
    passed: string;
    level: string;
    score: string;
    topics: string;
    issued: string;
    validUntil: string;
    number: string;
    signer: string | null;
    signerRole: string;
    check: string;
    code: string;
    seal: string;
  };
  holder: string;
  qr: Buffer;
};

/** The certificate on A4, landscape: the agency, the holder, the level and the score, the signature, the QR code to check it. */
export function CertificatePdf({ docTitle, agency, texts: x, holder, qr }: CertificatePdfProps) {
  return (
    <Document title={docTitle} author={agency.name} creator="BRIXA" producer="BRIXA">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <View style={s.head}>
              {agency.logo ? <Picture src={agency.logo} style={s.logo} /> : <Text style={s.agency}>{agency.name}</Text>}
              <View>
                <Text style={s.academy}>{x.academy}</Text>
                <View style={s.bar}>
                  <View style={s.barBlue} />
                  <View style={s.barCyan} />
                </View>
              </View>
            </View>

            <Text style={s.title}>{x.title}</Text>
            <View style={s.rule} />
            <Text style={s.certifies}>{x.certifies}</Text>
            <Text style={s.holder}>{holder}</Text>
            <View style={s.holderLine} />
            <Text style={s.passed}>{x.passed}</Text>
            <Text style={s.level}>{x.level}</Text>
            <Text style={s.score}>{x.score}</Text>
            <Text style={s.topics}>{x.topics}</Text>
            <View style={s.seal}>
              <Text style={s.sealTop}>BRIXA</Text>
              <Text style={s.sealLevel}>{x.seal}</Text>
            </View>

            <View style={s.foot}>
              <View style={s.facts}>
                <Text style={s.factStrong}>{x.number}</Text>
                <Text style={s.fact}>{x.issued}</Text>
                <Text style={s.fact}>{x.validUntil}</Text>
              </View>

              <View style={s.sign}>
                <View style={s.signLine} />
                {x.signer && <Text style={s.signer}>{x.signer}</Text>}
                <Text style={s.signerRole}>{x.signerRole}</Text>
              </View>

              <View style={s.check}>
                <Picture src={{ data: qr, format: "png" }} style={s.qr} />
                <Text style={s.checkText}>{x.check}</Text>
                <Text style={s.code}>{x.code}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
