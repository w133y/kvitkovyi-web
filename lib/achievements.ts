import { prisma } from "@/lib/prisma";

export function getAchievementsByNickname(nickname: string) {
  return prisma.achievement.findMany({
    where: { nickname },
    orderBy: { sortOrder: "asc" },
  });
}
