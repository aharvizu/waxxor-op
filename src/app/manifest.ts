import type { MetadataRoute } from "next";

/**
 * Web App Manifest — served at /manifest.webmanifest via Next.js's file
 * convention. `display: "standalone"` is what makes "Add to Home Screen"
 * launch without Safari's browser chrome (paired with the apple-mobile-
 * web-app-capable meta tag set in layout.tsx's metadata.appleWebApp).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Watson",
    short_name: "Watson",
    description: "Watson — Operations OS for technology service companies",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
