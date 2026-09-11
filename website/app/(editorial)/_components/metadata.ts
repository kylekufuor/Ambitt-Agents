import type { Metadata } from "next";

export const SITE_URL = "https://www.ambitt.agency";

// Square brand mark, the only raster brand asset we have. It suits a `summary`
// card; a 1200x630 image would earn `summary_large_image`.
const SHARE_IMAGE = { url: "/brand/ambitt-agent-avatar.png", width: 512, height: 512, alt: "Ambitt Agents" };

/**
 * Full metadata for one editorial page. Built whole per page because Next
 * merges metadata shallowly: a page that sets openGraph at all replaces the
 * layout's openGraph, image and site name included.
 */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Ambitt Agents", title, description, url: path, images: [SHARE_IMAGE] },
    twitter: { card: "summary", title, description, images: [SHARE_IMAGE.url] },
  };
}
