import { ListingVideos } from "./ListingVideos";
import { Panel } from "./ListingParts";
import { SpotMap, type Spot } from "./SpotMap";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** A listing's videos and its place on the map, on the client's page and the website. */
export function MediaPanels({
  media,
  t,
}: {
  media: { file: string | null; links: string[]; spot: Spot | null };
  t: Dictionary;
}) {
  return (
    <>
      {(media.file || media.links.length > 0) && (
        <div className="no-print">
          <Panel title={t.video.title} id="video">
            <ListingVideos file={media.file} links={media.links} />
          </Panel>
        </div>
      )}
      {media.spot && (
        <Panel title={t.spot.where} id="where">
          <SpotMap spot={media.spot} />
          {!media.spot.exact && <p className="mt-2 text-xs text-muted">{t.spot.approx}</p>}
        </Panel>
      )}
    </>
  );
}

/** "Open in Google Maps": the point when it's exact, else only the neighbourhood and town. */
export function mapsHref(spot: Spot | null, place: string) {
  if (spot?.exact) return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
}
