"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Plus, Radar, Star, StarOff, Trash2 } from "lucide-react";
import { deleteWatch, followLink, followListing, runWatch, saveWatch, setWatchActive } from "@/app/(app)/market/scout/actions";
import { MultiLocationPicker } from "@/components/client/MultiLocationPicker";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { localName } from "@/lib/i18n/dictionaries";
import type { Category, Region, Settlement, Subtype } from "@/lib/types";

/** Follow / stop following a listing Brix found. */
export function FollowButton({ listingId, following }: { listingId: string; following: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => followListing(listingId, !following))}
      className={`${following ? buttonClass.secondary : buttonClass.primary} px-3! py-1.5! text-xs!`}
      title={following ? t.scout.unfollow : t.scout.follow}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : following ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />}
      {following ? t.scout.following : t.scout.follow}
    </button>
  );
}

/** Paste a link to follow a listing found anywhere. */
export function FollowLinkForm() {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [bad, setBad] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await followLink(link);
          setBad(!result.ok);
          if (result.ok) setLink("");
        });
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setBad(false);
          }}
          placeholder={t.scout.followLinkPlaceholder}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={pending || !link.trim()} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
          {t.scout.follow}
        </button>
      </div>
      {bad && <p className="text-sm text-danger">{t.scout.followLinkBad}</p>}
    </form>
  );
}

/** One saved search: search now, pause, delete. */
export function WatchActions({ id, active }: { id: string; active: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {active && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await runWatch(id);
                setSaid(result.ok ? t.scout.searching : t.scout.alreadyToday);
              })
            }
            className={`${buttonClass.primary} px-3! py-1.5! text-xs!`}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />}
            {t.scout.searchNow}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => start(() => setWatchActive(id, !active))} className={`${buttonClass.secondary} px-3! py-1.5! text-xs!`}>
          {active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {active ? t.scout.pause : t.scout.resume}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => window.confirm(t.scout.removeConfirm) && start(() => deleteWatch(id))}
          className={`${buttonClass.ghost} px-3! py-1.5! text-xs! text-danger!`}
        >
          <Trash2 className="size-3.5" />
          {t.scout.remove}
        </button>
      </div>
      {said && <p className="text-xs text-muted">{said}</p>}
    </div>
  );
}

/** A new search: the deal, where, what kind, up to what price, private sellers only. */
export function WatchForm({
  regions,
  settlements,
  categories,
  subtypes,
  defaultSettlementId,
}: {
  regions: Region[];
  settlements: Settlement[];
  categories: Category[];
  subtypes: Subtype[];
  defaultSettlementId: string | null;
}) {
  const { t, lang } = useI18n();
  const S = t.scout;
  const router = useRouter();
  const [operation, setOperation] = useState<"sale" | "rent">("sale");
  const [place, setPlace] = useState({ settlementIds: defaultSettlementId ? [defaultSettlementId] : [], neighborhoodIds: [] as string[] });
  const [kinds, setKinds] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [privateOnly, setPrivateOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await saveWatch({
            operation,
            settlementIds: place.settlementIds,
            neighborhoodIds: place.neighborhoodIds,
            subtypeIds: kinds,
            priceMax: price.trim() ? Number(price.replace(/\s/g, "")) : null,
            privateOnly,
          });
          if (!result.ok) {
            setError(result.error === "tooMany" ? S.tooMany : result.error === "needTown" ? S.needTown : t.errors.generic);
            return;
          }
          setError(null);
          setKinds([]);
          setPrice("");
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{S.operation}</span>
        <div className="flex gap-1.5">
          {(["sale", "rent"] as const).map((op) => (
            <button key={op} type="button" aria-pressed={operation === op} onClick={() => setOperation(op)} className={chip(operation === op)}>
              {op === "sale" ? S.sale : S.rent}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{S.where}</span>
        <MultiLocationPicker
          regions={regions}
          settlements={settlements}
          settlementIds={place.settlementIds}
          neighborhoodIds={place.neighborhoodIds}
          onChange={setPlace}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{S.kinds}</span>
        <div className="space-y-2">
          {categories.map((category) => {
            const subs = subtypes.filter((s) => s.category_id === category.id);
            if (subs.length === 0) return null;
            return (
              <div key={category.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-full text-xs font-semibold uppercase tracking-wide text-subtle sm:w-28">{localName(category, lang)}</span>
                {subs.map((sub) => {
                  const on = kinds.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKinds((k) => (on ? k.filter((x) => x !== sub.id) : [...k, sub.id]))}
                      className={chip(on)}
                    >
                      {localName(sub, lang)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">{S.kindsHint}</p>
      </div>

      <label className="block max-w-xs">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{S.priceMax}</span>
        <input type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ""))} className={inputClass} />
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={privateOnly} onChange={(e) => setPrivateOnly(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-semibold">{S.privateOnly}</span>
          <span className="block text-xs text-muted">{S.privateOnlyHint}</span>
        </span>
      </label>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {S.save}
      </button>
    </form>
  );
}
