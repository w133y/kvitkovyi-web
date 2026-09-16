import { prisma } from "@/lib/prisma";

export async function getBio(nickname: string): Promise<string | null> {
  const row = await prisma.playerBio.findUnique({ where: { nickname } });
  return row?.bio ?? null;
}
