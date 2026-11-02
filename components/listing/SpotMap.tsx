"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** A listing's place: the exact point, or a circle it is somewhere in. */
export type Spot = { lat: number; lng: number; exact: boolean; radius?: number };

export const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILES_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** The accent color of the page's theme (the map's circle and point). */
export function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2563ff";
}

/** The map (OpenStreetMap): a circle of ~500 m when the place isn't exact, else the point. */
export function SpotMap({ spot, className = "h-64" }: { spot: Spot; className?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let place: (() => void) | null = null;
    let live = true;
    // the box may get its size only later (a hidden tab, a section opened): the tiles and the view follow it
    const resized = new ResizeObserver(() => {
      map?.invalidateSize();
      place?.();
    });
    void import("leaflet").then((L) => {
      if (!live || !box.current) return;
      // one finger scrolls the page on a phone; two move the map
      map = L.map(box.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile });
      L.tileLayer(TILES, { maxZoom: 19, attribution: TILES_CREDIT }).addTo(map);
      const color = accentColor();
      const center: [number, number] = [spot.lat, spot.lng];
      const radius = spot.radius ?? 500;
      if (spot.exact) L.circleMarker(center, { radius: 9, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }).addTo(map);
      else L.circle(center, { radius, color, weight: 2, fillColor: color, fillOpacity: 0.15 }).addTo(map);
      // the view once the box has a size (with none, the circle would be fitted at the closest zoom)
      place = () => {
        if (!map || !box.current?.clientWidth) return;
        if (spot.exact) map.setView(center, 16);
        else map.fitBounds(L.latLng(center).toBounds(radius * 2), { padding: [16, 16] });
        place = null;
      };
      place();
      resized.observe(box.current);
    });
    return () => {
      live = false;
      resized.disconnect();
      map?.remove();
    };
  }, [spot.lat, spot.lng, spot.exact, spot.radius]);

  return <div ref={box} className={`isolate w-full overflow-hidden rounded-2xl border border-line bg-raised ${className}`} />;
}
