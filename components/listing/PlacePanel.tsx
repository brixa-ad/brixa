import { Panel } from "./ListingParts";
import { SpotMap, type Spot } from "./SpotMap";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** A listing's place on the map, on the client's page and the website (a circle unless exclusive). */
export function PlacePanel({ spot, t }: { spot: Spot | null; t: Dictionary }) {
  if (!spot) return null;
  return (
    <Panel title={t.spot.where} id="where">
      <SpotMap spot={spot} />
      {!spot.exact && <p className="mt-2 text-xs text-muted">{t.spot.approx}</p>}
    </Panel>
  );
}

/** "Open in Google Maps": the point when it's exact, else only the neighbourhood and town. */
export function mapsHref(spot: Spot | null, place: string) {
  if (spot?.exact) return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
}
