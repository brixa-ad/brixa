"use client";

import { useState, useTransition } from "react";
import { Check, ClipboardPaste, Loader2 } from "lucide-react";
import { addNeighborhoods, saveMarketPrices } from "@/app/(app)/market/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { parseMarketPaste } from "@/lib/market-paste";

type Town = { id: string; name: string; neighborhoods: { id: string; name: string }[] };
type Price = { settlement_id: string; neighborhood_id: string | null; price_per_sqm: number; source: string | null; as_of: string };

const TOWN_ROW = "town";
const parse = (value: string) => {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};

/** Managers keep the average €/m² by neighborhood — typed in, or pasted from a portal's table. */
export function MarketPriceEditor({
  towns,
  prices,
  operation,
  today,
}: {
  towns: Town[];
  prices: Price[];
  operation: "sale" | "rent";
  today: string;
}) {
  const { t } = useI18n();
  const firstWithPrices = towns.find((town) => prices.some((p) => p.settlement_id === town.id)) ?? towns[0];
  const [townId, setTownId] = useState(firstWithPrices?.id ?? "");
  const valuesFor = (id: string) => {
    const out: Record<string, string> = {};
    for (const p of prices.filter((p) => p.settlement_id === id)) out[p.neighborhood_id ?? TOWN_ROW] = String(p.price_per_sqm);
    return out;
  };
  const latest = (id: string) =>
    prices.filter((p) => p.settlement_id === id).sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
  const [values, setValues] = useState<Record<string, string>>(() => valuesFor(firstWithPrices?.id ?? ""));
  const [source, setSource] = useState(latest(firstWithPrices?.id ?? "")?.source ?? "");
  const [asOf, setAsOf] = useState(today);
  const [pasted, setPasted] = useState("");
  const [pasteNote, setPasteNote] = useState<{ matched: number; added: number; missed: string[] } | null>(null);
  // neighbourhoods added from a pasted table, by town (until the page reloads with them)
  const [added, setAdded] = useState<Record<string, { id: string; name: string }[]>>({});
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const town = towns.find((x) => x.id === townId);
  const hoodsOf = (id: string) => {
    const base = towns.find((x) => x.id === id)?.neighborhoods ?? [];
    const extra = (added[id] ?? []).filter((h) => !base.some((b) => b.id === h.id));
    return [...base, ...extra].sort((a, b) => a.name.localeCompare(b.name, "bg"));
  };
  const rowsOf = (id: string) => [{ id: TOWN_ROW, name: t.market.wholeTown }, ...hoodsOf(id)];
  const rows = town ? rowsOf(town.id) : [];
  const valid = Object.values(values).every((v) => {
    const n = parse(v);
    return n === null || (Number.isFinite(n) && n > 0);
  });

  function chooseTown(id: string) {
    setTownId(id);
    setValues(valuesFor(id));
    setSource(latest(id)?.source ?? source);
    setPasteNote(null);
    setStatus("idle");
  }

  /** The pasted table: the town's missing neighbourhoods are added, the prices filled in and saved. */
  function applyPaste() {
    if (!town) return;
    // a price per m²: a sale 100–20 000 €, a month's rent 1–60 €
    const range = operation === "rent" ? { min: 1, max: 60 } : { min: 100, max: 20000 };
    setStatus("idle");
    startTransition(async () => {
      let hoods = hoodsOf(town.id);
      let result = parseMarketPaste(pasted, hoods, range);
      let newOnes = 0;
      if (result.missed.length > 0) {
        const response = await addNeighborhoods(town.id, result.missed);
        const fresh = response.hoods.filter((h) => !hoods.some((x) => x.id === h.id));
        newOnes = fresh.length;
        if (fresh.length > 0) {
          setAdded((current) => ({ ...current, [town.id]: [...(current[town.id] ?? []), ...fresh] }));
          hoods = [...hoods, ...fresh];
          result = parseMarketPaste(pasted, hoods, range);
        }
      }
      const next = { ...values };
      for (const [id, price] of result.prices) next[id] = String(price);
      setValues(next);
      setPasteNote({ matched: result.prices.size, added: newOnes, missed: result.missed });
      if (result.prices.size > 0) {
        const allRows = [{ id: TOWN_ROW }, ...hoods];
        const saved = await saveMarketPrices({
          operation,
          settlementId: town.id,
          prices: allRows.map((row) => ({ neighborhoodId: row.id === TOWN_ROW ? null : row.id, price: parse(next[row.id] ?? "") })),
          source,
          asOf,
        });
        setStatus(saved.ok ? "saved" : "failed");
      }
    });
  }

  function save() {
    if (!town) return;
    setStatus("idle");
    startTransition(async () => {
      const result = await saveMarketPrices({
        operation,
        settlementId: town.id,
        prices: rows.map((row) => ({ neighborhoodId: row.id === TOWN_ROW ? null : row.id, price: parse(values[row.id] ?? "") })),
        source,
        asOf,
      });
      setStatus(result.ok ? "saved" : "failed");
    });
  }

  if (towns.length === 0) return null;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-muted">
          {t.market.town}
          <select value={townId} onChange={(e) => chooseTown(e.target.value)} className={`${inputClass} mt-1`}>
            {towns.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted">
          {t.market.source}
          <input
            value={source}
            maxLength={120}
            placeholder={t.market.sourcePlaceholder}
            onChange={(e) => setSource(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-xs font-medium text-muted">
          {t.market.asOf}
          <input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
      </div>

      {/* paste a portal's table */}
      <div className="space-y-2 rounded-xl border border-dashed border-line-strong p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardPaste className="size-4 text-accent-fg" />
          {t.market.paste}
        </p>
        <p className="text-xs text-muted">{t.market.pasteHint}</p>
        <textarea
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={"Аспарухово: 2 120 €/м²\nБриз: 2 750 €/м²"}
          className={`${inputClass} font-mono text-xs`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={applyPaste} disabled={!pasted.trim() || pending} className={buttonClass.primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.market.pasteApply}
          </button>
          {pasteNote && (
            <span className="text-sm text-fg-2">
              {fmt(t.market.pasteResult, { matched: pasteNote.matched })}
              {pasteNote.added > 0 && <span className="block text-xs text-success">{fmt(t.market.pasteAdded, { n: pasteNote.added })}</span>}
              {pasteNote.missed.length > 0 && (
                <span className="block text-xs text-muted">{fmt(t.market.pasteMissed, { names: pasteNote.missed.join(", ") })}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <label htmlFor={`price-${row.id}`} className={`min-w-0 truncate text-sm ${row.id === TOWN_ROW ? "font-semibold" : "text-fg-2"}`}>
              {row.name}
            </label>
            <span className="flex shrink-0 items-center gap-1.5">
              <input
                id={`price-${row.id}`}
                inputMode="decimal"
                value={values[row.id] ?? ""}
                placeholder="—"
                onChange={(e) => {
                  setValues((v) => ({ ...v, [row.id]: e.target.value }));
                  setStatus("idle");
                }}
                className={`${inputClass} w-24 text-right tabular-nums`}
              />
              <span className="w-12 text-xs text-muted">{operation === "rent" ? t.market.perSqmMonth : t.market.perSqm}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !valid} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.market.save}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <Check className="size-4" />
            {t.market.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
