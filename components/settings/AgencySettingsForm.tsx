"use client";

import { useRef, useState, useTransition } from "react";
import { Building, CheckCircle2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { setAgencyLogo, updateAgency, type AgencyInput } from "@/app/(app)/settings/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

const POINT_KEYS = ["dealDouble", "deal", "listing", "exclusive", "viewing", "meeting", "client", "call"] as const;

/** Managers: the agency's details and logo, defaults and ranking points. */
export function AgencySettingsForm({
  organizationId,
  initial,
  logoUrl,
}: {
  organizationId: string;
  initial: AgencyInput;
  logoUrl: string | null;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    ...initial,
    commissionSalePercent: String(initial.commissionSalePercent),
    commissionRentMonths: String(initial.commissionRentMonths),
    points: Object.fromEntries(POINT_KEYS.map((k) => [k, String(initial.points[k])])) as Record<(typeof POINT_KEYS)[number], string>,
  });
  const [logo, setLogo] = useState(logoUrl);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [logoBusy, setLogoBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setStatus("idle");
  };
  const num = (value: string) => Number(value.replace(",", "."));

  async function uploadLogo(picked: File | undefined) {
    if (!picked) return;
    if (picked.size > 2 * 1024 * 1024) return setStatus("failed");
    setLogoBusy(true);
    const extension = (picked.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
    const path = `${organizationId}/logo-${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient().storage.from("agency-logos").upload(path, picked, { contentType: picked.type });
    if (!error && (await setAgencyLogo(path)).ok) {
      setLogo(URL.createObjectURL(picked));
    } else {
      setStatus("failed");
    }
    setLogoBusy(false);
    if (file.current) file.current.value = "";
  }

  const field = (key: "name" | "phone" | "email" | "website" | "address", label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input {...props} value={values[key]} onChange={(e) => set(key, e.target.value)} className={`${inputClass} mt-1`} />
    </label>
  );

  return (
    <div className="space-y-6">
      {/* logo */}
      <div className="flex items-center gap-4">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
          {logo ? (
            <img src={logo} alt={t.agency.logo} className="size-full object-contain p-1.5" />
          ) : (
            <Building className="size-8 text-subtle" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
          <button type="button" disabled={logoBusy} onClick={() => file.current?.click()} className={buttonClass.secondary}>
            {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {logo ? t.agency.changeLogo : t.agency.uploadLogo}
          </button>
          {logo && (
            <button
              type="button"
              disabled={logoBusy}
              onClick={async () => {
                setLogoBusy(true);
                if ((await setAgencyLogo(null)).ok) setLogo(null);
                setLogoBusy(false);
              }}
              className={buttonClass.ghost}
            >
              <Trash2 className="size-4" />
              {t.common.delete}
            </button>
          )}
        </div>
      </div>

      {/* contact details */}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", t.agency.name, { maxLength: 120 })}
        {field("phone", t.agency.phone, { type: "tel", maxLength: 40 })}
        {field("email", t.agency.email, { type: "email", maxLength: 200 })}
        {field("website", t.agency.website, { maxLength: 200, placeholder: "yavlena.bg" })}
        <div className="sm:col-span-2">{field("address", t.agency.address, { maxLength: 300 })}</div>
      </div>

      {/* defaults */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t.agency.defaults}</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs font-medium text-muted">
            {t.agency.currency}
            <select value={values.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)} className={`${inputClass} mt-1`}>
              {["EUR", "BGN", "USD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted">
            {t.agency.salePercent}
            <input inputMode="decimal" value={values.commissionSalePercent} onChange={(e) => set("commissionSalePercent", e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-muted">
            {t.agency.rentMonths}
            <input inputMode="decimal" value={values.commissionRentMonths} onChange={(e) => set("commissionRentMonths", e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>
      </div>

      {/* ranking points */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t.agency.points}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {POINT_KEYS.map((key) => (
            <label key={key} className="block text-xs font-medium text-muted">
              {t.agency.pointLabels[key]}
              <input
                inputMode="numeric"
                value={values.points[key]}
                onChange={(e) => {
                  if (!/^\d{0,4}$/.test(e.target.value)) return;
                  setValues((v) => ({ ...v, points: { ...v.points, [key]: e.target.value } }));
                  setStatus("idle");
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateAgency({
                ...values,
                commissionSalePercent: num(values.commissionSalePercent),
                commissionRentMonths: num(values.commissionRentMonths),
                points: Object.fromEntries(POINT_KEYS.map((k) => [k, Number(values.points[k] || "0")])) as AgencyInput["points"],
              });
              setStatus(result.ok ? "saved" : "failed");
            })
          }
          className={buttonClass.primary}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.agency.save}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.agency.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm font-medium text-danger">{t.errors.invalid}</span>}
      </div>
    </div>
  );
}
