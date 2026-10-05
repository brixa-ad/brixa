import "server-only";
import path from "node:path";
import { Document, Font, Image as Picture, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Inter (SIL Open Font License, see fonts/OFL.txt) — with Cyrillic, €, № and the stars
const FONTS = path.join(process.cwd(), "lib", "pdf", "fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONTS, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTS, "Inter-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONTS, "Inter-Bold.ttf"), fontWeight: 700 },
  ],
});
// whole words only — no hyphens in Bulgarian
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: "#0a1330",
  body: "#334063",
  muted: "#5d6a8a",
  line: "#dde3ee",
  soft: "#eef2f9",
  accent: "#1d4ed8",
  accentSoft: "#e8eefc",
  gold: "#f5b301",
  good: "#047857",
  warn: "#b45309",
  bad: "#dc2626",
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: C.body, paddingTop: 34, paddingBottom: 54, paddingHorizontal: 38, lineHeight: 1.4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  logo: { height: 30, maxWidth: 140, objectFit: "contain" },
  agency: { fontSize: 13, fontWeight: 700, color: C.ink },
  headRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 15, fontWeight: 700, color: C.ink },
  small: { fontSize: 8, color: C.muted },
  section: { marginTop: 16 },
  h2: { fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 6 },
  propRow: { flexDirection: "row", gap: 14 },
  photo: { width: 200, height: 134, borderRadius: 6, objectFit: "cover" },
  propTitle: { fontSize: 13, fontWeight: 700, color: C.ink },
  price: { fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 6 },
  verdict: { marginTop: 16, padding: 14, borderRadius: 8, backgroundColor: C.soft },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stars: { fontSize: 20, color: C.gold, letterSpacing: 1 },
  label: { fontSize: 14, fontWeight: 700 },
  tiles: { flexDirection: "row", gap: 8, marginTop: 10 },
  tile: { flex: 1, backgroundColor: "#ffffff", borderRadius: 6, padding: 9 },
  tileAccent: { flex: 1, backgroundColor: C.accentSoft, borderRadius: 6, padding: 9 },
  tileLabel: { fontSize: 8, color: C.muted },
  tileValue: { fontSize: 12, fontWeight: 700, color: C.ink, marginTop: 2 },
  tileValueAccent: { fontSize: 12, fontWeight: 700, color: C.accent, marginTop: 2 },
  advice: { marginTop: 10, fontSize: 10, fontWeight: 600, color: C.ink },
  table: { borderTopWidth: 1, borderTopColor: C.line },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 },
  th: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: "uppercase" },
  td: { fontSize: 8.5 },
  num: { textAlign: "right" },
  foot: { position: "absolute", left: 38, right: 38, bottom: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  disclaimer: { marginTop: 14, fontSize: 7.5, color: C.muted },
});

const TONE: Record<number, string> = { 5: C.good, 4: C.good, 3: C.body, 2: C.warn, 1: C.bad };

export type PdfImage = { data: Buffer; format: "jpg" | "png" } | null;

export type AnalysisPdfProps = {
  audience: "owner" | "buyer";
  title: string;
  preparedFor: string;
  date: string;
  agency: { name: string; logo: PdfImage; contacts: string };
  broker: string | null;
  property: { title: string; place: string; specs: string; price: string; photo: PdfImage };
  verdict: {
    stars: number;
    label: string;
    diff: string;
    tiles: { label: string; value: string; accent?: boolean }[];
    notes: string[];
    advice: string | null;
  };
  comparables: { head: string[]; rows: string[][] } | null;
  comparablesTitle: string;
  sales: { head: string[]; rows: string[][] } | null;
  salesTitle: string;
  disclaimer: string;
  pageLabel: string;
};

const WIDTHS = [0.17, 0.33, 0.1, 0.08, 0.17, 0.15];

function Table({ head, rows, widths = WIDTHS }: { head: string[]; rows: string[][]; widths?: number[] }) {
  const cell = (i: number) => ({ width: `${widths[i] * 100}%`, paddingRight: 4 });
  const numeric = (i: number) => i >= head.length - 4;
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>
        {head.map((h, i) => (
          <Text key={h} style={[s.th, cell(i), numeric(i) && i > 1 ? s.num : {}]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={s.tr} wrap={false}>
          {row.map((value, i) => (
            <Text key={i} style={[s.td, cell(i), numeric(i) && i > 1 ? s.num : {}]}>
              {value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The market analysis of one listing on A4: for the owner (the price to ask) or for a buyer (a good price). */
export function AnalysisPdf(p: AnalysisPdfProps) {
  const v = p.verdict;
  return (
    <Document title={`${p.title} — ${p.property.title}`} author={p.agency.name} creator="BRIXA" language="bg">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {p.agency.logo ? <Picture src={p.agency.logo} style={s.logo} /> : <Text style={s.agency}>{p.agency.name}</Text>}
          <View style={s.headRight}>
            <Text style={s.docTitle}>{p.title}</Text>
            <Text style={s.small}>
              {p.preparedFor} · {p.date}
            </Text>
          </View>
        </View>

        <View style={[s.section, s.propRow]}>
          {p.property.photo && <Picture src={p.property.photo} style={s.photo} />}
          <View style={{ flex: 1 }}>
            <Text style={s.propTitle}>{p.property.title}</Text>
            {p.property.place && <Text style={{ marginTop: 2 }}>{p.property.place}</Text>}
            {p.property.specs && <Text style={{ marginTop: 2, color: C.muted }}>{p.property.specs}</Text>}
            <Text style={s.price}>{p.property.price}</Text>
            {p.broker && <Text style={[s.small, { marginTop: 8 }]}>{p.broker}</Text>}
          </View>
        </View>

        <View style={s.verdict} wrap={false}>
          <View style={s.starsRow}>
            <Text style={s.stars}>{"★".repeat(v.stars) + "☆".repeat(5 - v.stars)}</Text>
            <Text style={[s.label, { color: TONE[v.stars] ?? C.ink }]}>{v.label}</Text>
            <Text style={{ color: C.muted }}>· {v.diff}</Text>
          </View>
          <View style={s.tiles}>
            {v.tiles.map((tile) => (
              <View key={tile.label} style={tile.accent ? s.tileAccent : s.tile}>
                <Text style={s.tileLabel}>{tile.label}</Text>
                <Text style={tile.accent ? s.tileValueAccent : s.tileValue}>{tile.value}</Text>
              </View>
            ))}
          </View>
          {v.advice && <Text style={s.advice}>{v.advice}</Text>}
          {v.notes.map((note) => (
            <Text key={note} style={{ marginTop: 4, fontSize: 8.5, color: C.muted }}>
              {note}
            </Text>
          ))}
        </View>

        {p.comparables && p.comparables.rows.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>{p.comparablesTitle}</Text>
            <Table head={p.comparables.head} rows={p.comparables.rows} />
          </View>
        )}

        {p.sales && p.sales.rows.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>{p.salesTitle}</Text>
            <Table head={p.sales.head} rows={p.sales.rows} widths={[0.2, 0.32, 0.14, 0.18, 0.16]} />
          </View>
        )}

        <Text style={s.disclaimer}>{p.disclaimer}</Text>

        <View style={s.foot} fixed>
          <Text>{p.agency.contacts}</Text>
          <Text render={({ pageNumber, totalPages }) => `${p.pageLabel} ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
