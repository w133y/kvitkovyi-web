// Account deletion (a player's own request from their profile, or an admin
// acting on an e-mailed/Discord request) — see /privacy.
//
// The User row itself stays but is stripped of everything identifying:
// purchase records (DonateOrder / CosmeticOrder / Order) must be kept for
// accounting and reference it with a required relation. Everything else
// personal is deleted or unlinked.

import { prisma } from "@/lib/prisma";
import { getDiscordLink } from "@/lib/mc-db";

export async function deleteAccountData(userId: string): Promise<{ ok: true } | { error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, role: true } });
  if (!user) return { error: "Акаунт не знайдено" };

  if (user.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1) {
    return { error: "Це останній адмін сайту — спершу призначте іншого адміна" };
  }

  // The player's bio is keyed by their Minecraft nickname, resolved via the
  // Discord link — look it up before the Discord id is erased.
  const nickname = user.discordId ? (await getDiscordLink(user.discordId))?.nickname ?? null : null;

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.mapMarker.deleteMany({ where: { submittedByUserId: userId } }),
    prisma.galleryPhoto.updateMany({ where: { submittedByUserId: userId }, data: { submittedByUserId: null } }),
    prisma.wikiArticle.updateMany({ where: { authorUserId: userId }, data: { authorUserId: null } }),
    ...(nickname ? [prisma.playerBio.deleteMany({ where: { nickname } })] : []),
    ...(user.discordId ? [prisma.welcomeDm.deleteMany({ where: { discordUserId: user.discordId } })] : []),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: null,
        email: null,
        emailVerified: null,
        image: null,
        discordId: null,
        role: "USER",
        showDiscord: false,
        twitchUrl: null,
        youtubeUrl: null,
        pronoun: null,
      },
    }),
  ]);
  return { ok: true };
}
