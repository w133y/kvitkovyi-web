// Automatic "Спонсор" achievement card when someone buys (or is granted) a
// privilege: title = tier, subtitle = the current season from the gallery
// settings (/admin → Галерея). At most one card per player per season —
// buying Флорист again does nothing, upgrading to Меценат adds the Меценат
// card, and a Меценат holder buying Флорист gets nothing more.

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/admin-log";
import type { DonateTier } from "@prisma/client";

const CATEGORY = "Спонсор";
const CARD: Record<DonateTier, { title: string; icon: string; rank: number }> = {
  FLORIST: { title: "Флорист", icon: "/cards/florist.svg", rank: 1 },
  MECENAT: { title: "Меценат", icon: "/cards/mecenat.svg", rank: 2 },
};

// Best-effort: a failure here must never break the payment/grant flow.
export async function awardSponsorCard(nickname: string, tier: DonateTier): Promise<void> {
  try {
    const season = (await prisma.gallerySettings.findUnique({ where: { id: "default" } }))?.currentSeason ?? 1;
    const subtitle = `Сезон ${season}`;

    const existing = await prisma.achievement.findMany({
      where: {
        nickname: { equals: nickname, mode: "insensitive" },
        category: CATEGORY,
        subtitle,
        title: { in: Object.values(CARD).map((c) => c.title) },
      },
      select: { title: true },
    });
    const bestOwned = Math.max(0, ...existing.map((e) => Object.values(CARD).find((c) => c.title === e.title)?.rank ?? 0));
    if (bestOwned >= CARD[tier].rank) return;

    await prisma.achievement.create({
      data: {
        nickname,
        category: CATEGORY,
        iconType: "image",
        icon: CARD[tier].icon,
        title: CARD[tier].title,
        subtitle,
      },
    });
  } catch (err) {
    await logError("sponsor-cards: failed to award card", nickname, tier, err);
  }
}
