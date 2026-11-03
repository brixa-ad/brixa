"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { FullScreen } from "@/components/property/PhotoGallery";
import type { Photo } from "@/lib/types";
import type { VideoLink } from "@/lib/video";
import { VideoPlayer, VideoSlide, listingVideos } from "./ListingVideos";

/**
 * A listing's photos at the top, the way the portals open a listing: edge to edge on the phone,
 * swipe through them (tap: full screen), the counter, and whatever floats on them (back, share, badges).
 * Its videos come right after the cover photo, among them.
 */
export function ListingHero({
  photos,
  videos,
  topLeft,
  topRight,
  bottomLeft,
  photoClass = "",
}: {
  photos: Photo[];
  /** the own video (a signed link) and the links to where it's posted */
  videos?: { file: string | null; links: string[] };
  /** a class on each photo (the shared page counts the photos seen) */
  photoClass?: string;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
}) {
  const { t } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const [playing, setPlaying] = useState<VideoLink | null>(null);
  const closeFull = useCallback(() => setFull(null), []);
  const closePlayer = useCallback(() => setPlaying(null), []);
  const shown = photos.filter((p) => p.url);
  const clips = listingVideos(videos);
  // the cover, the videos, the other photos
  const slides = [
    ...shown.slice(0, 1).map((photo) => ({ photo, at: 0 })),
    ...clips.map((video) => ({ video })),
    ...shown.slice(1).map((photo, i) => ({ photo, at: i + 1 })),
  ];
  const firstVideo = shown.length > 0 ? 1 : 0;
  const onVideo = clips.length > 0 && index >= firstVideo && index < firstVideo + clips.length;

  const scrollTo = (slide: number) => {
    const el = strip.current;
    if (el) el.scrollTo({ left: slide * el.clientWidth, behavior: "smooth" });
  };
  const go = (step: number) => scrollTo((index + step + slides.length) % slides.length);

  // swiped away from the own video: it stops
  useEffect(() => {
    strip.current?.querySelectorAll("video").forEach((video) => {
      if (Number(video.closest("[data-slide]")?.getAttribute("data-slide")) !== index) video.pause();
    });
  }, [index]);

  const float = "grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65";

  return (
    <div className="relative -mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-3xl">
      <div className="aspect-[4/3] sm:aspect-[16/9]">
        {slides.length === 0 ? (
          <div className="grid size-full place-items-center bg-raised text-subtle">
            <span className="flex flex-col items-center gap-2">
              <ImageIcon className="size-8" />
              <span className="text-sm">{t.photos.none}</span>
            </span>
          </div>
        ) : (
          <div
            ref={strip}
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
            className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          >
            {slides.map((slide, i) =>
              "video" in slide ? (
                <div key={slide.video.kind === "file" ? "video-file" : slide.video.link.url} data-slide={i} className="size-full shrink-0 snap-center">
                  <VideoSlide video={slide.video} onOpen={setPlaying} />
                </div>
              ) : (
                <button
                  key={slide.photo.id}
                  type="button"
                  data-slide={i}
                  onClick={() => setFull(slide.at)}
                  className="size-full shrink-0 snap-center"
                  aria-label={`${i + 1} / ${slides.length}`}
                >
                  {/* the whole photo, as it was taken; its own colours, blurred, fill the sides */}
                  <span className="relative block size-full overflow-hidden">
                    <img src={slide.photo.url!} alt="" aria-hidden loading={i === 0 ? "eager" : "lazy"} className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
                    <img src={slide.photo.url!} alt="" loading={i === 0 ? "eager" : "lazy"} className={`relative size-full object-contain ${photoClass}`} />
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* what floats on the photo */}
      {topLeft && <div className="absolute left-3 top-3 flex gap-2">{topLeft}</div>}
      {topRight && <div className="absolute right-3 top-3 flex gap-2">{topRight}</div>}
      {bottomLeft && !onVideo && <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">{bottomLeft}</div>}
      {/* above the video's own controls, it stays out of the way there */}
      <div className={`absolute right-3 flex items-center gap-1.5 ${onVideo ? "top-3" : "bottom-3"} ${topRight && onVideo ? "hidden" : ""}`}>
        {clips.length > 0 && !onVideo && (
          <button
            type="button"
            onClick={() => scrollTo(firstVideo)}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/75"
          >
            <Play className="size-3.5 fill-current" />
            {t.video.title}
          </button>
        )}
        {slides.length > 1 && (
          <span className="pointer-events-none rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
            {index + 1} / {slides.length}
          </span>
        )}
      </div>
      {slides.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="‹" className={`${float} absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="›" className={`${float} absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {full !== null && <FullScreen photos={shown} startAt={full} onClose={closeFull} />}
      {playing && <VideoPlayer link={playing} onClose={closePlayer} />}
    </div>
  );
}
