"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { Field, inputClass } from "@/components/ui/form";
import { settlementLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Neighborhood, Region, Settlement } from "@/lib/types";
import { ADDRESS_LIMITS, type AddressParts } from "@/lib/address";

const POPULAR = [
  { region: "SOF", city: "София" },
  { region: "VAR", city: "Варна" },
  { region: "PDV", city: "Пловдив" },
  { region: "BGS", city: "Бургас" },
];

type AddressFields = AddressParts & { cadastralId: string };

export function LocationPicker({
  regions,
  settlements,
  settlementId,
  neighborhoodId,
  address,
  showFlatParts,
  onLocationChange,
  onAddressChange,
  errors,
}: {
  regions: Region[];
  settlements: Settlement[];
  settlementId: string;
  neighborhoodId: string | null;
  address: AddressFields;
  /** block / entrance / apartment only make sense for flats and offices */
  showFlatParts: boolean;
  onLocationChange: (next: { settlementId: string; neighborhoodId: string | null }) => void;
  onAddressChange: (key: keyof AddressFields, value: string) => void;
  errors: { settlementId?: string; neighborhoodId?: string } & Partial<Record<keyof AddressFields, string>>;
}) {
  const { t } = useI18n();

  const settlementById = useMemo(
    () => new Map(settlements.map((settlement) => [settlement.id, settlement])),
    [settlements]
  );
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  const [regionFilter, setRegionFilter] = useState(
    () => settlementById.get(settlementId)?.region_id ?? ""
  );
  const [neighborhoodCache, setNeighborhoodCache] = useState<Record<string, Neighborhood[]>>({});

  const neighborhoods = settlementId ? neighborhoodCache[settlementId] : undefined;
  const loadingNeighborhoods = Boolean(settlementId) && neighborhoods === undefined;

  useEffect(() => {
    if (!settlementId || neighborhoodCache[settlementId]) return;
    let ignore = false;

    createClient()
      .from("geo_neighborhoods")
      .select("id, settlement_id, name")
      .eq("settlement_id", settlementId)
      .order("name")
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) console.error("Loading neighborhoods failed:", error);
        setNeighborhoodCache((cache) => ({ ...cache, [settlementId]: data ?? [] }));
      });

    return () => {
      ignore = true;
    };
  }, [settlementId, neighborhoodCache]);

  const popular = useMemo(
    () =>
      POPULAR.map(({ region, city }) => {
        const regionRow = regions.find((r) => r.code === region);
        return settlements.find(
          (s) => s.region_id === regionRow?.id && s.name === city && s.settlement_type === "гр."
        );
      }).filter((s): s is Settlement => Boolean(s)),
    [regions, settlements]
  );

  const settlementOptions: ComboOption[] = useMemo(
    () =>
      settlements
        .filter((s) => !regionFilter || s.region_id === regionFilter)
        .map((s) => ({
          value: s.id,
          label: settlementLabel(s),
          hint: regionFilter ? undefined : `${t.location.regionPrefix} ${regionById.get(s.region_id)?.name ?? ""}`,
        })),
    [settlements, regionFilter, regionById, t.location.regionPrefix]
  );

  const neighborhoodOptions: ComboOption[] = useMemo(
    () => (neighborhoods ?? []).map((n) => ({ value: n.id, label: n.name })),
    [neighborhoods]
  );

  function selectSettlement(id: string | null) {
    const settlement = id ? settlementById.get(id) : undefined;
    if (settlement) setRegionFilter(settlement.region_id);
    onLocationChange({ settlementId: id ?? "", neighborhoodId: null });
  }

  function selectRegion(regionId: string) {
    setRegionFilter(regionId);
    const current = settlementById.get(settlementId);
    if (current && regionId && current.region_id !== regionId) {
      onLocationChange({ settlementId: "", neighborhoodId: null });
    }
  }

  return (
    <div className="space-y-4">
      {popular.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">
            {t.location.popular}
          </span>
          {popular.map((settlement) => {
            const active = settlement.id === settlementId;
            return (
              <button
                key={settlement.id}
                type="button"
                onClick={() => selectSettlement(settlement.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-surface text-fg-2 hover:border-line-strong hover:bg-raised"
                }`}
              >
                <MapPin className="size-3.5" />
                {settlement.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t.location.region}>
          {(props) => (
            <select
              {...props}
              value={regionFilter}
              onChange={(event) => selectRegion(event.target.value)}
              className={inputClass}
            >
              <option value="">{t.location.anyRegion}</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t.location.settlement} required error={errors.settlementId}>
          {(props) => (
            <Combobox
              {...props}
              options={settlementOptions}
              value={settlementId || null}
              onChange={selectSettlement}
              placeholder={t.location.searchSettlement}
              emptyText={t.location.noMatches}
            />
          )}
        </Field>
      </div>

      {settlementId && (
        <Field
          label={t.location.neighborhood}
          error={errors.neighborhoodId}
          hint={
            !loadingNeighborhoods && neighborhoodOptions.length === 0
              ? t.location.noNeighborhoods
              : undefined
          }
        >
          {(props) => (
            <Combobox
              {...props}
              options={neighborhoodOptions}
              value={neighborhoodId}
              onChange={(id) => onLocationChange({ settlementId, neighborhoodId: id })}
              placeholder={loadingNeighborhoods ? t.common.loading : t.location.searchNeighborhood}
              emptyText={t.location.noMatches}
              disabled={loadingNeighborhoods || neighborhoodOptions.length === 0}
            />
          )}
        </Field>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <Field label={t.location.street} error={errors.street}>
          {(props) => (
            <input
              {...props}
              value={address.street}
              maxLength={ADDRESS_LIMITS.street}
              onChange={(event) => onAddressChange("street", event.target.value)}
              placeholder={t.location.streetPlaceholder}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t.location.streetNo} error={errors.streetNo}>
          {(props) => (
            <input
              {...props}
              value={address.streetNo}
              maxLength={ADDRESS_LIMITS.streetNo}
              onChange={(event) => onAddressChange("streetNo", event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>

      {showFlatParts && (
        <div className="grid grid-cols-3 gap-3">
          {(["block", "entrance", "apartment"] as const).map((key) => (
            <Field key={key} label={t.location[key]} error={errors[key]}>
              {(props) => (
                <input
                  {...props}
                  value={address[key]}
                  maxLength={ADDRESS_LIMITS[key]}
                  onChange={(event) => onAddressChange(key, event.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      <Field label={t.location.cadastral} error={errors.cadastralId}>
        {(props) => (
          <input
            {...props}
            value={address.cadastralId}
            maxLength={ADDRESS_LIMITS.cadastralId}
            onChange={(event) => onAddressChange("cadastralId", event.target.value)}
            placeholder={t.location.cadastralPlaceholder}
            className={inputClass}
          />
        )}
      </Field>
    </div>
  );
}
