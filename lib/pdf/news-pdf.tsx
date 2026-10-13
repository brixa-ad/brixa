import "server-only";
import { Document, Image as Picture, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
// the fonts (Inter, with Cyrillic and €) are registered there
import "./analysis-pdf";
import type { PdfImage } from "./analysis-pdf";

const C = {
  ink: "#0a1330",
  body: "#334063",
  muted: "#5d6a8a",
  line: "#dde3ee",
  soft: "#eef2f9",
  accent: "#1d4ed8",
  accentSoft: "#e8eefc",
  good: "#047857",
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, color: C.body, paddingTop: 34, paddingBottom: 54, paddingHorizontal: 40, lineHeight: 1.45 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  logo: { height: 34, maxWidth: 160, objectFit: "contain" },
  agency: { fontSize: 14, fontWeight: 700, color: C.ink },
  headRight: { alignItems: "flex-end" },
  small: { fontSize: 8.5, color: C.muted },
  kicker: { marginTop: 22, fontSize: 9, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { marginTop: 4, fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.2 },
  subtitle: { marginTop: 4, fontSize: 11, color: C.muted },
  tiles: { flexDirection: "row", gap: 8, marginTop: 18 },
  tile: { flex: 1, backgroundColor: C.soft, borderRadius: 8, padding: 11 },
  tileAccent: { flex: 1, backgroundColor: C.accentSoft, borderRadius: 8, padding: 11 },
  tileLabel: { fontSize: 8, color: C.muted },
  tileValue: { fontSize: 15, fontWeight: 700, color: C.ink, marginTop: 3 },
  tileValueAccent: { fontSize: 15, fontWeight: 700, color: C.accent, marginTop: 3 },
  tileNote: { fontSize: 7.5, color: C.muted, marginTop: 4 },
  footnote: { marginTop: 6, fontSize: 7.5, color: C.muted },
  h2: { marginTop: 18, fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: C.line },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 },
  td: { fontSize: 9, flex: 1 },
  tdNum: { fontSize: 9, flex: 1, textAlign: "right", fontWeight: 600, color: C.ink },
  bigText: { marginTop: 18, fontSize: 14, lineHeight: 1.5, color: C.ink },
  letter: { marginTop: 18, fontSize: 10.5, lineHeight: 1.55 },
  cta: { marginTop: 20, borderRadius: 10, backgroundColor: C.accent, padding: 16 },
  ctaTitle: { fontSize: 14, fontWeight: 700, color: "#ffffff" },
  ctaLine: { marginTop: 4, fontSize: 11, color: "#dbe6ff" },
  card: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, objectFit: "cover" },
  initials: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.accentSoft, color: C.accent, fontSize: 20, fontWeight: 700, textAlign: "center", paddingTop: 18 },
  name: { fontSize: 13, fontWeight: 700, color: C.ink },
  role: { fontSize: 9, color: C.muted, marginTop: 1 },
  contact: { fontSize: 10, color: C.ink, marginTop: 3 },
  foot: { position: "absolute", left: 40, right: 40, bottom: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
});

export type NewsPdfProps = {
  docTitle: string;
  preparedFor: string;
  date: string;
  agency: { name: string; logo: PdfImage; contacts: string };
  kicker: string;
  title: string;
  subtitle: string | null;
  tiles: { label: string; value: string; note?: string; accent?: boolean }[];
  footnote: string | null;
  table: { title: string; rows: [string, string][] } | null;
  bigText: string | null;
  letter: string | null;
  cta: { title: string; line: string };
  broker: { name: string; role: string | null; phone: string | null; email: string | null; photo: PdfImage; initials: string };
};

/** A piece of news or an analysis for a client, on A4: the agency's logo, the numbers, the letter, a call to action and the broker. */
export function NewsPdf(p: NewsPdfProps) {
  return (
    <Document title={p.docTitle} author={p.agency.name} creator={p.agency.name} language="bg">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {p.agency.logo ? <Picture src={p.agency.logo} style={s.logo} /> : <Text style={s.agency}>{p.agency.name}</Text>}
          <View style={s.headRight}>
            <Text style={s.small}>{p.preparedFor}</Text>
            <Text style={s.small}>{p.date}</Text>
          </View>
        </View>

        <Text style={s.kicker}>{p.kicker}</Text>
        <Text style={s.title}>{p.title}</Text>
        {p.subtitle && <Text style={s.subtitle}>{p.subtitle}</Text>}

        {p.tiles.length > 0 && (
          <View style={s.tiles} wrap={false}>
            {p.tiles.map((tile) => (
              <View key={tile.label} style={tile.accent ? s.tileAccent : s.tile}>
                <Text style={s.tileLabel}>{tile.label}</Text>
                <Text style={tile.accent ? s.tileValueAccent : s.tileValue}>{tile.value}</Text>
                {tile.note && <Text style={s.tileNote}>{tile.note}</Text>}
              </View>
            ))}
          </View>
        )}
        {p.footnote && <Text style={s.footnote}>{p.footnote}</Text>}

        {p.table && p.table.rows.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{p.table.title}</Text>
            <View style={s.table}>
              {p.table.rows.map(([label, value]) => (
                <View key={label} style={s.tr}>
                  <Text style={s.td}>{label}</Text>
                  <Text style={s.tdNum}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {p.bigText && <Text style={s.bigText}>{p.bigText}</Text>}
        {p.letter && <Text style={s.letter}>{p.letter}</Text>}

        <View style={s.cta} wrap={false}>
          <Text style={s.ctaTitle}>{p.cta.title}</Text>
          <Text style={s.ctaLine}>{p.cta.line}</Text>
        </View>

        <View style={s.card} wrap={false}>
          {p.broker.photo ? <Picture src={p.broker.photo} style={s.avatar} /> : <Text style={s.initials}>{p.broker.initials}</Text>}
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{p.broker.name}</Text>
            {p.broker.role && <Text style={s.role}>{p.broker.role}</Text>}
            {p.broker.phone && <Text style={s.contact}>{p.broker.phone}</Text>}
            {p.broker.email && <Text style={[s.contact, { marginTop: 1 }]}>{p.broker.email}</Text>}
          </View>
        </View>

        <View style={s.foot} fixed>
          <Text>{p.agency.contacts}</Text>
          <Text>{p.date}</Text>
        </View>
      </Page>
    </Document>
  );
}
