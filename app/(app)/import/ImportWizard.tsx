"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, Card, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import {
  FIELDS,
  brokerOf,
  classOf,
  clientTypesOf,
  currencyOf,
  floorOf,
  guessMapping,
  numberOf,
  operationOf,
  parseCsv,
  parseVcf,
  subtypeOf,
  toTable,
  yesOf,
  type FieldKey,
  type ImportKind,
  type Member,
  type Table,
} from "@/lib/import";
import { runImport, type ImportResult } from "./actions";

type Subtype = { code: string; name: string };
const CLIENT_TYPES = ["buyer", "seller", "tenant", "landlord", "investor"] as const;
const BATCH = { clients: 300, properties: 100 } as const;

/** Read the chosen file into a table (Excel, CSV in UTF-8 or Windows-1251, or phone contacts). */
async function readFile(file: File): Promise<{ table: Table; contacts: boolean } | "old" | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) return "old";
  try {
    if (name.endsWith(".xlsx")) {
      const { readSheet } = await import("read-excel-file/browser");
      return { table: toTable((await readSheet(file)) as unknown[][]), contacts: false };
    }
    const bytes = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(bytes);
    // Bulgarian CSVs saved from Excel are often Windows-1251
    if ((text.match(/�/g) ?? []).length > 3) text = new TextDecoder("windows-1251").decode(bytes);
    const contacts = name.endsWith(".vcf") || /^BEGIN:VCARD/im.test(text.slice(0, 200));
    return { table: toTable(contacts ? parseVcf(text) : parseCsv(text)), contacts };
  } catch {
    return null;
  }
}

export function ImportWizard({
  initialKind,
  members,
  defaultTown,
  subtypes,
}: {
  initialKind: ImportKind;
  members: Member[];
  defaultTown: string;
  subtypes: Subtype[];
}) {
  const { t } = useI18n();
  const T = t.importer;
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [clientType, setClientType] = useState<(typeof CLIENT_TYPES)[number]>("buyer");
  const [subtype, setSubtype] = useState("");
  const [operation, setOperation] = useState<"sale" | "rent">("sale");
  const [town, setTown] = useState(defaultTown);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function chooseKind(next: ImportKind) {
    setKind(next);
    if (table) setMapping(guessMapping(next, table.headers));
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setResult(null);
    const read = await readFile(file);
    if (read === "old") return setProblem(T.oldXls);
    if (!read || read.table.rows.length === 0) return setProblem(T.unreadable);
    const nextKind = read.contacts ? "clients" : kind;
    setKind(nextKind);
    setFileName(file.name);
    setTable(read.table);
    setMapping(guessMapping(nextKind, read.table.headers));
  }

  // each row as the database takes it (and its line in the file, for the report)
  const rows = useMemo(() => {
    if (!table) return [];
    const out: Record<string, unknown>[] = [];
    table.rows.forEach((row, i) => {
      const get = (key: FieldKey) => (mapping[key] !== undefined ? (row[mapping[key]!] ?? "").trim() : "");
      const broker_id = brokerOf(get("broker"), members);
      const line = i + 2;
      if (kind === "clients") {
        const full_name = [get("full_name"), get("last_name")].filter(Boolean).join(" ");
        const phone = get("phone");
        if (!full_name && !phone) return;
        const types = clientTypesOf(get("types"));
        out.push({
          line,
          full_name: full_name || phone,
          phone,
          email: get("email"),
          types: types.length > 0 ? types : [clientType],
          client_class: classOf(get("client_class")),
          notes: get("notes"),
          broker_id,
        });
      } else {
        const priceText = get("price");
        const floor = floorOf(get("floor"));
        const totalFloors = numberOf(get("total_floors"));
        const whole = (n: number | null) => (n === null ? "" : String(Math.round(n)));
        if (!get("subtype") && !priceText && !get("title") && !get("address")) return;
        out.push({
          line,
          subtype_code: subtypeOf(get("subtype")) ?? subtypeOf(get("title")) ?? (subtype || null),
          operation: operationOf(get("operation")) ?? operation,
          title: get("title"),
          price: numberOf(priceText) ?? "",
          currency: currencyOf(get("currency")) ?? currencyOf(priceText) ?? "EUR",
          area: numberOf(get("area")) ?? "",
          rooms: whole(numberOf(get("rooms"))),
          floor: whole(floor.floor),
          total_floors: whole(totalFloors ?? floor.total),
          town: get("town") || town,
          neighborhood: get("neighborhood"),
          address: get("address"),
          description: get("description"),
          exclusive: yesOf(get("exclusive")),
          owner_name: get("owner_name"),
          owner_phone: get("owner_phone"),
          broker_id,
        });
      }
    });
    return out;
  }, [table, mapping, kind, members, clientType, subtype, operation, town]);

  async function run() {
    const total = rows.length;
    const all: ImportResult = { imported: 0, skipped: [], errors: [] };
    setProblem(null);
    setProgress({ done: 0, total });
    for (let i = 0; i < total; i += BATCH[kind]) {
      const batch = rows.slice(i, i + BATCH[kind]);
      const part = await runImport(kind, batch);
      if (!part) {
        all.errors.push(...batch.map((r) => ({ line: Number(r.line), reason: "other" })));
      } else {
        all.imported += part.imported;
        all.skipped.push(...part.skipped);
        all.errors.push(...part.errors);
      }
      setProgress({ done: Math.min(total, i + BATCH[kind]), total });
    }
    setProgress(null);
    setResult(all);
  }

  const reason = (r: string) => (r === "name" || r === "type" ? T.reasons[r] : T.reasons.other);
  const memberName = (id: unknown) => members.find((m) => m.id === id)?.name ?? T.noBroker;
  const subtypeName = (code: unknown) => subtypes.find((s) => s.code === code)?.name ?? "—";

  if (result) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="size-5 text-success" />
          {T.doneTitle}
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li className="font-semibold text-success">{fmt(T.imported, { n: result.imported })}</li>
          {result.skipped.length > 0 && <li className="text-fg-2">{fmt(T.skipped, { n: result.skipped.length })}</li>}
          {result.errors.length > 0 && <li className="text-danger">{fmt(T.errors, { n: result.errors.length })}</li>}
        </ul>
        {(result.skipped.length > 0 || result.errors.length > 0) && (
          <ul className="mt-3 max-h-60 space-y-0.5 overflow-y-auto rounded-xl bg-raised/60 p-3 text-xs text-muted">
            {result.skipped.map((s) => (
              <li key={`s${s.line}`}>
                {fmt(T.line, { n: s.line })}: {s.name} {s.phone}
              </li>
            ))}
            {result.errors.map((e) => (
              <li key={`e${e.line}`} className="text-danger">
                {fmt(T.line, { n: e.line })}: {reason(e.reason)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={kind === "clients" ? "/clients" : "/properties?view=mine"} className={buttonClass.primary}>
            {kind === "clients" ? T.toClients : T.toProperties}
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setTable(null);
              setFileName("");
            }}
            className={buttonClass.secondary}
          >
            {T.again}
          </button>
        </div>
      </Card>
    );
  }

  const preview = rows.slice(0, 5);
  const labelClass = "block text-xs font-medium text-muted";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <p className="text-sm font-semibold">{T.what}</p>
          <div className="mt-2 inline-flex rounded-xl border border-line bg-canvas/40 p-1">
            {(["clients", "properties"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => chooseKind(k)}
                aria-pressed={kind === k}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${kind === k ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
              >
                {T[k]}
              </button>
            ))}
          </div>

          <p className="mt-5 text-sm font-semibold">{T.file}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass.secondary}>
              <Upload className="size-4" />
              {T.pick}
            </button>
            {table && (
              <span className="inline-flex items-center gap-1.5 text-sm text-fg-2">
                <FileSpreadsheet className="size-4 text-accent-fg" />
                {fmt(T.rows, { n: table.rows.length, file: fileName })}
              </span>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt,.vcf,text/csv,text/vcard"
              className="hidden"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{T.fileHint}</p>
          {problem && <p className="mt-2 text-sm font-medium text-danger">{problem}</p>}
        </Card>

        {table && (
          <Card title={T.columns} description={T.columnsHint}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS[kind].map((field) => {
                const column = mapping[field.key];
                const sample = column !== undefined ? table.rows.find((r) => r[column])?.[column] : undefined;
                return (
                  <label key={field.key} className={labelClass}>
                    {T.fields[field.key]}
                    <select
                      value={column ?? ""}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === "") delete next[field.key];
                          else next[field.key] = Number(e.target.value);
                          return next;
                        })
                      }
                      className={`${inputClass} mt-1`}
                    >
                      <option value="">{T.skip}</option>
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                    {sample && <span className="mt-0.5 block truncate text-[11px] text-subtle">{fmt(T.sample, { value: sample.slice(0, 60) })}</span>}
                  </label>
                );
              })}
            </div>

            <p className="mt-6 text-sm font-semibold">{T.defaults}</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {kind === "clients" ? (
                <label className={labelClass}>
                  {T.defaultType}
                  <select value={clientType} onChange={(e) => setClientType(e.target.value as typeof clientType)} className={`${inputClass} mt-1`}>
                    {CLIENT_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {t.options.clientType[c]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className={labelClass}>
                    {T.defaultSubtype}
                    <select value={subtype} onChange={(e) => setSubtype(e.target.value)} className={`${inputClass} mt-1`}>
                      <option value="">{T.defaultSubtypeNone}</option>
                      {subtypes.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    {T.defaultOperation}
                    <select value={operation} onChange={(e) => setOperation(e.target.value as "sale" | "rent")} className={`${inputClass} mt-1`}>
                      <option value="sale">{t.options.operation.sale}</option>
                      <option value="rent">{t.options.operation.rent}</option>
                    </select>
                  </label>
                  <label className={labelClass}>
                    {T.defaultTown}
                    <input value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} className={`${inputClass} mt-1`} />
                  </label>
                </>
              )}
            </div>
          </Card>
        )}

        {table && preview.length > 0 && (
          <Card title={T.preview}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <tbody className="divide-y divide-line-soft">
                  {preview.map((r) => (
                    <tr key={String(r.line)}>
                      {kind === "clients" ? (
                        <>
                          <td className="py-2 pr-3 font-medium">{String(r.full_name)}</td>
                          <td className="py-2 pr-3 text-muted">{String(r.phone ?? "")}</td>
                          <td className="py-2 pr-3 text-muted">
                            {(r.types as string[]).map((x) => t.options.clientType[x as (typeof CLIENT_TYPES)[number]]).join(", ")}
                            {r.client_class ? ` · ${String(r.client_class)}` : ""}
                          </td>
                          <td className="py-2 text-muted">{memberName(r.broker_id)}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-3 font-medium">{r.subtype_code ? subtypeName(r.subtype_code) : <span className="text-danger">?</span>}</td>
                          <td className="py-2 pr-3 text-muted">{t.options.operation[r.operation as "sale" | "rent"]}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {r.price === "" ? "—" : `${String(r.price)} ${String(r.currency)}`}
                          </td>
                          <td className="py-2 pr-3 text-muted">{r.area === "" ? "—" : `${String(r.area)} ${t.units.sqm}`}</td>
                          <td className="py-2 pr-3 text-muted">{[r.neighborhood, r.town].filter(Boolean).join(", ")}</td>
                          <td className="py-2 text-muted">{memberName(r.broker_id)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={run} disabled={progress !== null || rows.length === 0} className={buttonClass.primary}>
                {progress ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {progress ? fmt(T.running, progress) : fmt(T.run, { n: rows.length })}
              </button>
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-3 text-sm text-muted">
        <Card>
          <ul className="space-y-2">
            <li>{T.howSheets}</li>
            <li>{T.howPhone}</li>
            <li>{T.howCrm}</li>
            <li>{T.brokerHint}</li>
            <li>{T.onceHint}</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
