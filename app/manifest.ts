import type { MetadataRoute } from "next";

// Lets phones install BRIXA to the home screen and open it full-screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BRIXA",
    short_name: "BRIXA",
    description: "CRM за брокери на недвижими имоти",
    lang: "bg",
    start_url: "/properties",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
