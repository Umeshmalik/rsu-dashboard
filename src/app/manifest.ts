import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "~/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#1f2a33",
    lang: "en",
    categories: ["finance"],
  };
}
