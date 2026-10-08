"use client";

import { useMemo, useState, useTransition } from "react";
import { Mail, Phone, Plus, Search } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { telHref } from "@/lib/phone";
import type { Plan, PlatformDetails, SubscriptionStatus } from "@/lib/subscription";
import { saveDetails, savePlan, setAgency } from "./actions";

export type AgencyRow = {
  id: string;
  name: string;
  kind: "agency" | "solo";
  city: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  trial_ends_at: string | null;
  plan_code: string | null;
  paid_until: string | null;
  comped: boolean;
  terms_accepted_at: string | null;
  owner: { name: string; email: string; phone: string | null } | null;
  people: number;
  invited: number;
  listings: number;
  clients: number;
  deals: number;
  last_sign_in: string | null;
  last_activity: string | null;
  /** worked out on the server */
  status: SubscriptionStatus;
  daysLeft: number | null;
  /** the trial's last day (YYYY-MM-DD) */
  trialUntil: string | null;
};

const STATUS_TONE: Record<SubscriptionStatus, string> = {
  trial: "bg-accent-soft text-accent-fg",
  active: "bg-success/10 text-success",
  expired: "bg-danger/10 text-danger",
  comped: "bg-raised text-fg-2",
};

/** Every agency: who, how much they use BRIXA, and what they pay — set by hand for now. */
export function AgencyList({ agencies, plans }: { agencies: AgencyRow[]; plans: Plan[] }) {
  const { t } = useI18n();
  const P = t.platform;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SubscriptionStatus | null>(null);
  const label: Record<SubscriptionStatus, string> = { trial: P.inTrial, active: P.paying, expired: P.expired, comped: P.comped };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agencies.filter(
      (a) =>
        (!filter || a.status === filter) &&
        (!q || [a.name, a.city, a.email, a.phone, a.owner?.name, a.owner?.email, a.owner?.phone].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [agencies, filter, query]);

  if (agencies.length === 0) return <p className="text-sm text-muted">{P.none}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-line-strong bg-raised px-3">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={P.search}
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none sm:text-sm"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([null, "trial", "active", "expired", "comped"] as const).map((s) => {
            const n = s ? agencies.filter((a) => a.status === s).length : agencies.length;
            if (s && n === 0) return null;
            return (
              <button
                key={s ?? "all"}
                type="button"
                onClick={() => setFilter(s)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  filter === s ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg-2 hover:border-accent/50"
                }`}
              >
                {s ? label[s] : P.filterAll} · {n}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="space-y-4">
        {shown.map((a) => (
          <AgencyCard key={a.id} agency={a} plans={plans} statusLabel={label[a.status]} />
        ))}
      </ul>
    </div>
  );
}

function AgencyCard({ agency: a, plans, statusLabel }: { agency: AgencyRow; plans: Plan[]; statusLabel: string }) {
  const { t, lang } = useI18n();
  const P = t.platform;
  const [plan, setPlan] = useState(a.plan_code ?? "");
  const [paidUntil, setPaidUntil] = useState(a.paid_until ?? "");
  const [trialUntil, setTrialUntil] = useState(a.trialUntil ?? "");
  const [comped, setComped] = useState(a.comped);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const when = (iso: string | null) => (iso ? formatDate(iso, lang) : "—");

  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{a.name}</h3>
          <p className="text-sm text-muted">{[a.kind === "solo" ? P.kindSolo : P.kindAgency, a.city].filter(Boolean).join(" · ")}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[a.status]}`}>
          {statusLabel}
          {a.status === "trial" && a.daysLeft !== null && ` · ${a.daysLeft}`}
        </span>
      </div>

      {a.owner && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">{a.owner.name}</span>
          {a.owner.phone && (
            <a href={telHref(a.owner.phone)} className="inline-flex items-center gap-1 text-accent-fg">
              <Phone className="size-3.5" />
              {a.owner.phone}
            </a>
          )}
          <a href={`mailto:${a.owner.email}`} className="inline-flex min-w-0 items-center gap-1 break-all text-fg-2">
            <Mail className="size-3.5" />
            {a.owner.email}
          </a>
        </div>
      )}

      <p className="mt-2 text-sm text-fg-2">
        {fmt(P.counts, { people: a.people, listings: a.listings, clients: a.clients, deals: a.deals })}
        {a.invited > 0 && <span className="text-muted"> {fmt(P.invited, { n: a.invited })}</span>}
      </p>
      <p className="mt-1 text-xs text-muted">
        {P.created}: {when(a.created_at)} · {P.lastSignIn}: {when(a.last_sign_in)} · {P.lastActivity}: {when(a.last_activity)}
      </p>
      <p className="mt-1 text-xs text-muted">{a.terms_accepted_at ? fmt(P.termsYes, { date: when(a.terms_accepted_at) }) : P.termsNo}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line-soft pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto_auto] lg:items-end">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">{P.plan}</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputClass}>
            <option value="">{P.noPlan}</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">{P.paidUntil}</span>
          <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">{P.trialUntil}</span>
          <input type="date" value={trialUntil} onChange={(e) => setTrialUntil(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 py-2 text-sm font-medium">
          <input type="checkbox" checked={comped} onChange={(e) => setComped(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          {P.compedLabel}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setAgency({ organizationId: a.id, plan: plan || null, paidUntil: paidUntil || null, comped, trialUntil: trialUntil || null });
                setState(result.ok ? "saved" : "failed");
              })
            }
            className={buttonClass.primary}
          >
            {pending ? t.common.saving : P.save}
          </button>
          {state === "saved" && <span className="text-sm text-success">{P.saved}</span>}
          {state === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
        </div>
      </div>
    </li>
  );
}

/** The packages: name, up to how many people, the price a month, shown or not; and a new one. */
export function PlansEditor({ plans }: { plans: Plan[] }) {
  const { t } = useI18n();
  const P = t.platform;
  const nextPosition = (plans.at(-1)?.position ?? 0) + 1;
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <PlanRow key={p.code} plan={p} />
      ))}
      <PlanRow plan={{ code: "", name: "", max_people: null, price_month: 0, position: nextPosition, active: true }} isNew />
      <p className="text-xs text-muted">{P.plansHint}</p>
    </div>
  );
}

function PlanRow({ plan, isNew = false }: { plan: Plan; isNew?: boolean }) {
  const { t } = useI18n();
  const P = t.platform;
  const [code, setCode] = useState(plan.code);
  const [name, setName] = useState(plan.name);
  const [max, setMax] = useState(plan.max_people === null ? "" : String(plan.max_people));
  const [price, setPrice] = useState(isNew ? "" : String(plan.price_month));
  const [active, setActive] = useState(plan.active);
  const [state, setState] = useState<"idle" | "saved" | "code" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await savePlan(
        { code, name, maxPeople: max.trim() ? Number(max) : null, price: Number(price.replace(",", ".")), position: plan.position, active },
        isNew
      );
      setState(result.ok ? "saved" : result.error === "code" ? "code" : "failed");
      if (result.ok && isNew) {
        setCode("");
        setName("");
        setMax("");
        setPrice("");
      }
    });
  }

  return (
    <div className={`grid grid-cols-2 items-end gap-3 rounded-xl border p-3 sm:grid-cols-[7rem_minmax(0,1fr)_7rem_7rem_auto_auto] ${isNew ? "border-dashed border-line-strong" : "border-line"}`}>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-muted">{P.planCode}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} disabled={!isNew} className={`${inputClass} font-mono`} />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-muted">{P.planName}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-muted">{P.planMax}</span>
        <input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="∞" className={inputClass} />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-muted">{P.planPrice}</span>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className={inputClass} />
      </label>
      <label className="flex items-center gap-2 py-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
        {P.planActive}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending} className={isNew ? buttonClass.secondary : buttonClass.primary}>
          {isNew && <Plus className="size-4" />}
          {isNew ? P.addPlan : P.save}
        </button>
        {state === "saved" && <span className="text-xs text-success">{P.saved}</span>}
        {state === "code" && <span className="text-xs text-danger">{P.planCode}</span>}
        {state === "failed" && <span className="text-xs text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}

/** BRIXA's own details, and how long a new agency tries BRIXA. */
export function DetailsForm({ details }: { details: PlatformDetails | null }) {
  const { t } = useI18n();
  const P = t.platform;
  const [form, setForm] = useState({
    companyName: details?.company_name ?? "",
    eik: details?.eik ?? "",
    address: details?.address ?? "",
    email: details?.email ?? "",
    phone: details?.phone ?? "",
    website: details?.website ?? "",
    trialDays: String(details?.trial_days ?? 30),
  });
  const [state, setState] = useState<"idle" | "saved" | "eik" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const field = (key: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-fg-2">{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} {...extra} />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("companyName", P.companyName)}
        {field("eik", P.eik, { inputMode: "numeric" })}
        {field("address", P.address)}
        {field("phone", P.phone, { type: "tel" })}
        {field("email", P.email, { type: "email" })}
        {field("website", P.website)}
        {field("trialDays", P.trialDays, { inputMode: "numeric" })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveDetails({ ...form, trialDays: Number(form.trialDays) });
              setState(result.ok ? "saved" : result.error === "eik" ? "eik" : "failed");
            })
          }
          className={buttonClass.primary}
        >
          {pending ? t.common.saving : P.save}
        </button>
        {state === "saved" && <span className="text-sm text-success">{P.saved}</span>}
        {state === "eik" && <span className="text-sm text-danger">{t.auth.invalidEik}</span>}
        {state === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
