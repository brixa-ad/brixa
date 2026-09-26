import type { MetadataRoute } from "next";

// Lets phones install BRIXA to the home screen and open it full-screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BRIXA",
    short_name: "BRIXA",
    description: "Повече сделки. По-малко работа.",
    lang: "bg",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#040915",
    theme_color: "#040915",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
