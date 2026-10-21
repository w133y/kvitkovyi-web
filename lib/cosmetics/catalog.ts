// The /shop/cosmetics catalog, cached: hundreds of rows that only change
// when an admin publishes or edits an item (lib/actions/cosmetics-admin.ts
// clears the tag), so a page view doesn't re-run the query every time.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cosmeticAssetUrl } from "@/lib/cosmetics/asset-url";

export const COSMETICS_CATALOG_TAG = "cosmetics-catalog";

export type CatalogCosmetic = {
  id: string;
  type: "HAT" | "BACKPACK" | "BALLOON" | "FURNITURE";
  name: string;
  priceFlowers: number;
  colorCustomizable: boolean;
  thumbnailUrl: string | null;
  modelUrl: string;
  textureUrl: string;
};

// The hour is only a backstop for edits made straight in the DB.
// ponytail: unstable_cache is the pre-`use cache` API; switch once the app
// opts into cacheComponents.
export const getPublishedCatalog = unstable_cache(
  async (): Promise<CatalogCosmetic[]> => {
    const items = await prisma.cosmeticItem.findMany({
      where: { status: "PUBLISHED", product: { active: true } },
      select: {
        id: true,
        type: true,
        priceFlowers: true,
        colorCustomizable: true,
        thumbnailUrl: true,
        modelKey: true,
        textureKey: true,
        product: { select: { name: true } },
      },
      orderBy: { product: { sortOrder: "asc" } },
    });
    return items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.product.name,
      priceFlowers: item.priceFlowers,
      colorCustomizable: item.colorCustomizable,
      thumbnailUrl: item.thumbnailUrl,
      modelUrl: cosmeticAssetUrl(item.modelKey),
      textureUrl: cosmeticAssetUrl(item.textureKey),
    }));
  },
  ["cosmetics-catalog"],
  { tags: [COSMETICS_CATALOG_TAG], revalidate: 3600 }
);
