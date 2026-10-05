import type { MetadataRoute } from "next";

// Lets her "Add to Home Screen": SnapList opens like an app, and on iPhone a
// home-screen app keeps its saved data (Safari clears a website's storage after
// 7 days without a visit).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnapList — @soldbychica",
    short_name: "SnapList",
    description: "List an item, and everything about your Depop shop.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf6f0",
    theme_color: "#d7263d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
