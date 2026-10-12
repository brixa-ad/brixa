"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/form";
import type { SaleDoc, SaleOffice } from "@/lib/sale-docs";
import { saveSaleDoc, saveSaleOffice } from "./actions";

type Field = { key: string; label: string; long?: boolean };

/** One row of inputs and its own "Save". */
function Row({ fields, initial, onSave }: { fields: Field[]; initial: Record<string, string>; onSave: (values: Record<string, string>) => Promise<{ ok: boolean }> }) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className={`block text-xs font-medium text-muted ${f.long ? "sm:col-span-2" : ""}`}>
            {f.label}
            {f.long ? (
              <textarea
                rows={2}
                value={values[f.key] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setStatus("idle");
                }}
                className={`${inputClass} mt-1`}
              />
            ) : (
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setStatus("idle");
                }}
                className={`${inputClass} mt-1`}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setStatus((await onSave(values)).ok ? "saved" : "failed"))}
          className={buttonClass.secondary}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Запази
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="size-4" />
            Запазено
          </span>
        )}
        {status === "failed" && <span className="text-sm text-danger">Не се запази</span>}
      </div>
    </div>
  );
}

export function DocsEditor({ docs }: { docs: SaleDoc[] }) {
  return (
    <ul className="space-y-5">
      {docs.map((d) => (
        <li key={d.code} className="rounded-xl border border-line p-3">
          <p className="mb-2 text-sm font-semibold">{d.title}</p>
          <Row
            fields={[
              { key: "fee", label: "Такса" },
              { key: "term", label: "Срок" },
              { key: "validity", label: "Валидност", long: true },
              { key: "online", label: "Онлайн", long: true },
              { key: "about", label: "Какво е и защо", long: true },
            ]}
            initial={{ fee: d.fee ?? "", term: d.term ?? "", validity: d.validity ?? "", online: d.online ?? "", about: d.about ?? "" }}
            onSave={(v) => saveSaleDoc(d.code, { about: v.about, fee: v.fee, term: v.term, validity: v.validity, online: v.online })}
          />
        </li>
      ))}
    </ul>
  );
}

const KIND: Record<string, string> = { municipality: "Общината (данъчна оценка)", cadastre: "Кадастърът", registry: "Службата по вписванията" };

export function OfficesEditor({ offices }: { offices: SaleOffice[] }) {
  const cities = [...new Set(offices.map((o) => o.city))];
  return (
    <div className="space-y-2">
      {cities.map((city) => (
        <details key={city} className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">{city}</summary>
          <ul className="mt-3 space-y-4">
            {offices
              .filter((o) => o.city === city)
              .map((o) => (
                <li key={o.id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{KIND[o.kind]}</p>
                  <Row
                    fields={[
                      { key: "name", label: "Име", long: true },
                      { key: "address", label: "Адрес", long: true },
                      { key: "phone", label: "Телефон" },
                      ...(o.kind === "municipality"
                        ? [
                            { key: "fee", label: "Такса за данъчна оценка" },
                            { key: "term", label: "Срок за данъчна оценка" },
                          ]
                        : []),
                    ]}
                    initial={{ name: o.name, address: o.address ?? "", phone: o.phone ?? "", fee: o.fee ?? "", term: o.term ?? "" }}
                    onSave={(v) => saveSaleOffice(o.id, { name: v.name, address: v.address, phone: v.phone, fee: v.fee, term: v.term })}
                  />
                </li>
              ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
