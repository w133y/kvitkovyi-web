"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchPlayerNicknames } from "@/lib/mc-db";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
}

export async function listAchievements() {
  await requireAdmin();
  return prisma.achievement.findMany({
    orderBy: [{ nickname: "asc" }, { sortOrder: "asc" }],
  });
}

// Backs the nickname autocomplete in the admin form — suggests real
// Minecraft nicknames (from the plugin DB) rather than letting the admin
// mistype a name achievements then silently attach to.
export async function searchPlayers(query: string) {
  await requireAdmin();
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchPlayerNicknames(trimmed, 20);
}

export type AchievementInput = {
  nickname: string;
  category: string;
  iconType: "emoji" | "image";
  icon: string;
  title: string;
  subtitle: string;
  borderColor: string;
  background: string;
  sortOrder: number;
};

function sanitizeCommon(data: Omit<AchievementInput, "nickname">) {
  const category = data.category.trim();
  const icon = data.icon.trim();
  const title = data.title.trim();

  if (!category) throw new Error("Вкажіть категорію досягнення");
  if (!icon) throw new Error("Вкажіть емодзі або посилання на іконку");
  if (!title) throw new Error("Вкажіть заголовок досягнення");

  if (data.iconType === "image") {
    try {
      new URL(icon);
    } catch {
      throw new Error("Посилання на іконку має бути коректним URL");
    }
  }

  return {
    category,
    iconType: data.iconType,
    icon,
    title,
    subtitle: data.subtitle.trim() || null,
    borderColor: data.borderColor.trim() || null,
    background: data.background.trim() || null,
    sortOrder: Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
  };
}

function sanitize(data: AchievementInput) {
  const nickname = data.nickname.trim();
  if (!nickname) throw new Error("Вкажіть нікнейм гравця");
  return { nickname, ...sanitizeCommon(data) };
}

// One card, awarded to several players at once (e.g. everyone who played a
// given season) — the admin form's nickname field is a multi-select, so
// creating covers 1..N players in a single call instead of N round trips.
export async function createAchievementsForPlayers(
  nicknames: string[],
  data: Omit<AchievementInput, "nickname">
) {
  await requireAdmin();
  const common = sanitizeCommon(data);
  const clean = Array.from(new Set(nicknames.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) throw new Error("Виберіть хоча б одного гравця");

  await prisma.achievement.createMany({
    data: clean.map((nickname) => ({ nickname, ...common })),
  });

  revalidatePath("/admin");
  for (const nickname of clean) {
    revalidatePath(`/profile/${nickname}`);
  }
}

export async function updateAchievement(id: string, data: AchievementInput) {
  await requireAdmin();
  const clean = sanitize(data);
  const existing = await prisma.achievement.findUnique({ where: { id } });
  await prisma.achievement.update({ where: { id }, data: clean });
  revalidatePath("/admin");
  revalidatePath(`/profile/${clean.nickname}`);
  if (existing && existing.nickname !== clean.nickname) {
    revalidatePath(`/profile/${existing.nickname}`);
  }
}

export async function deleteAchievement(id: string) {
  await requireAdmin();
  const existing = await prisma.achievement.findUnique({ where: { id } });
  await prisma.achievement.delete({ where: { id } });
  revalidatePath("/admin");
  if (existing) revalidatePath(`/profile/${existing.nickname}`);
}
