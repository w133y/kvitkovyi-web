"use server";

// Public-facing reads for the /shop/cosmetics catalog — no admin check,
// unlike lib/actions/cosmetics-admin.ts.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDiscordLink, getFlowerBalance } from "@/lib/mc-db";
import { cosmeticAssetUrl } from "@/lib/cosmetics/asset-url";

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

export async function listPublishedCosmeticsForShop(): Promise<CatalogCosmetic[]> {
  const items = await prisma.cosmeticItem.findMany({
    where: { status: "PUBLISHED", product: { active: true } },
    include: { product: true },
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
}

// null when signed out, not linked, or the DB lookup failed — the catalog
// UI treats all three the same way (checkout blocked, balance shown as
// "—"), the exact reason only matters for the sign-in prompt it already
// shows separately.
export async function getMyFlowerBalance(): Promise<number | null> {
  const session = await auth();
  if (!session?.user?.discordId) return null;
  const link = await getDiscordLink(session.user.discordId);
  if (!link) return null;
  return getFlowerBalance(link.nickname);
}

// Which cosmetics this player already owns — feeds the "Збережене" filter
// tab. Keyed by discordId the same way as getMyFlowerBalance, not by
// nickname directly, since that's what the session actually has.
export async function getMyOwnedCosmeticIds(): Promise<string[]> {
  const session = await auth();
  if (!session?.user) return [];
  const grants = await prisma.cosmeticGrant.findMany({
    where: { order: { userId: session.user.id }, status: "DELIVERED" },
    select: { cosmeticItemId: true },
  });
  return [...new Set(grants.map((g) => g.cosmeticItemId))];
}
