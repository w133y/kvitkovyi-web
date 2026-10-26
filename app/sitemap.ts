import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getDisabledPages } from "@/lib/page-access";
import { SITE_PAGES } from "@/lib/site-pages";

// Reads the DB, which isn't there at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL || "https://kvitkovyi.com").replace(/\/$/, "");
  const disabled = await getDisabledPages();
  const pages = ["/", "/shop", ...SITE_PAGES.filter((p) => !disabled.includes(p.key)).map((p) => p.path), "/privacy", "/terms", "/offer"];
  const articles = disabled.includes("wiki")
    ? []
    : await prisma.wikiArticle.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true, category: { select: { slug: true } } },
      });
  return [
    ...pages.map((path) => ({ url: base + (path === "/" ? "" : path) })),
    // Slugs are Cyrillic; sitemaps want percent-encoded URLs.
    ...articles.map((a) => ({
      url: `${base}/wiki/${encodeURIComponent(a.category.slug)}/${encodeURIComponent(a.slug)}`,
      lastModified: a.updatedAt,
    })),
  ];
}
