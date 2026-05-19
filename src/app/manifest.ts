import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AXON CORE",
    short_name: "AXON",
    description: "KI-gestützte Dokumentation für globale Konzerne.",
    start_url: "/",
    display: "standalone",
    background_color: "#030304",
    theme_color: "#030304",
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

