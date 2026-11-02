"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { TILES, TILES_CREDIT, accentColor } from "@/components/listing/SpotMap";
import { buttonClass } from "@/components/ui/form";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };

/** OpenStreetMap's search (one request at a time, only when the broker asks or the town changes). */
async function search(query: string): Promise<Point | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bg&q=${encodeURIComponent(query)}`,
      { headers: { "Accept-Language": "bg" } }
    );
    const data = (await res.json()) as { lat: string; lon: string }[];
    return data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
  } catch {
    return null;
  }
}

/** The first of the queries OpenStreetMap finds ("гр."/"с." left out — its search doesn't know them). */
async function geocode(...queries: (string | null | undefined | false)[][]) {
  for (const parts of queries) {
    const query = parts
      .filter((part): part is string => Boolean(part && part.trim()))
      .map((part) => part.replace(/^(гр|с)\.\s*/, "").trim())
      .join(", ");
    if (!query) continue;
    const found = await search(query);
    if (found) return found;
  }
  return null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * The listing's point on the map: a tap puts it, the pin can be dragged, "Find by the address" looks
 * it up. The agency sees the point; clients and other agencies a circle of ~500 m (the exact point
 * only when the contract is exclusive).
 */
export function SpotPicker({
  value,
  onChange,
  town,
  neighborhood,
  street,
  exclusive,
  disabled,
}: {
  value: Point | null;
  onChange: (next: Point | null) => void;
  /** "Варна" — where the map starts with no point yet */
  town: string | null;
  neighborhood: string | null;
  /** "ул. Шипка 12" */
  street: string;
  exclusive: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const S = t.spot;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const pin = useRef<import("leaflet").Marker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const change = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [finding, setFinding] = useState(false);
  const [missed, setMissed] = useState(false);

  useEffect(() => {
    change.current = onChange;
  });

  // the map, once
  useEffect(() => {
    let live = true;
    const resized = new ResizeObserver(() => map.current?.invalidateSize());
    void import("leaflet").then((L) => {
      if (!live || !box.current) return;
      resized.observe(box.current);
      leaflet.current = L;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView([42.7, 25.3], 7);
      L.tileLayer(TILES, { maxZoom: 19, attribution: TILES_CREDIT }).addTo(m);
      m.on("click", (e) => change.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }));
      map.current = m;
      setReady(true);
    });
    return () => {
      live = false;
      resized.disconnect();
      map.current?.remove();
      map.current = null;
      pin.current = null;
    };
  }, []);

  // the pin follows the value
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    const at: [number, number] = [value.lat, value.lng];
    if (!pin.current) {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:${accentColor()};border:3px solid #fff;box-shadow:0 2px 6px rgb(0 0 0 / .5)"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      pin.current = L.marker(at, { draggable: !disabled, icon, autoPan: true }).addTo(m);
      pin.current.on("dragend", () => {
        const p = pin.current?.getLatLng();
        if (p) change.current({ lat: round(p.lat), lng: round(p.lng) });
      });
      if (m.getZoom() < 15) m.setView(at, 17);
    } else {
      pin.current.setLatLng(at);
    }
  }, [ready, value, disabled]);

  // no point yet: the map starts at the neighbourhood (or the town)
  const area = [neighborhood, town].filter(Boolean).join(", ");
  const hasValue = Boolean(value);
  useEffect(() => {
    if (!ready || hasValue || (!neighborhood && !town)) return;
    let live = true;
    const timer = setTimeout(() => {
      void geocode([neighborhood, town], [town]).then((p) => {
        if (live && p && map.current) map.current.setView([p.lat, p.lng], neighborhood ? 15 : 13);
      });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready, hasValue, neighborhood, town]);

  async function findByAddress() {
    setFinding(true);
    setMissed(false);
    const p = await geocode(street.trim() ? [street, neighborhood, town] : [], street.trim() ? [street, town] : [], [neighborhood, town], [town]);
    setFinding(false);
    if (!p) {
      setMissed(true);
      return;
    }
    onChange({ lat: round(p.lat), lng: round(p.lng) });
    map.current?.setView([p.lat, p.lng], street.trim() ? 17 : 15);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-2">
          <MapPin className="size-4 text-accent-fg" />
          {S.title}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={findByAddress} disabled={disabled || finding || (!street.trim() && !area)} className={buttonClass.secondary}>
            {finding ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
            {S.find}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} disabled={disabled} className={buttonClass.ghost}>
              <X className="size-4" />
              {S.clear}
            </button>
          )}
        </div>
      </div>
      <div ref={box} className="isolate h-72 w-full overflow-hidden rounded-xl border border-line bg-raised" />
      <p className="text-xs text-muted">
        {value ? (exclusive ? S.exactShown : S.circleShown) : S.tapHint}
        {missed && <span className="ml-1 text-warning">{S.notFound}</span>}
      </p>
    </div>
  );
}
