"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPlayersForFilter, searchPlayerNicknames } from "@/lib/mc-db";
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

// Every nickname in the plugin's play_time table — the "Усі гравці" button
// when awarding a card to everyone (an empty LIKE pattern matches all rows).
export async function listAllPlayers(): Promise<string[]> {
  await requireAdmin();
  return searchPlayerNicknames("", 5000);
}

export type PlayerFilter = {
  minHours?: number | null;
  maxHours?: number | null;
  excludeAfk?: boolean; // compare against playtime minus AFK time
  activeWithinDays?: number | null; // last seen within N days
  firstJoinFrom?: string | null; // "YYYY-MM-DD"
  firstJoinTo?: string | null; // "YYYY-MM-DD", inclusive
  minVotes?: number | null;
  withDiscord?: boolean;
  privilege?: "all" | "any" | "FLORIST" | "MECENAT" | "none";
  // Skip players who already have a card with this category + title.
  excludeCard?: { category: string; title: string } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

// "Фільтри гравців" in the card form — returns matching nicknames, most
// playtime first.
export async function filterPlayers(f: PlayerFilter): Promise<string[]> {
  await requireAdmin();
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const minHours = num(f.minHours);
  const maxHours = num(f.maxHours);
  const activeDays = num(f.activeWithinDays);
  const minVotes = num(f.minVotes);
  const from = dayStart(f.firstJoinFrom);
  const toStart = dayStart(f.firstJoinTo);
  const to = toStart === null ? null : toStart + DAY_MS;
  const now = Date.now();

  let players = (await listPlayersForFilter()).filter((p) => {
    const hours = f.excludeAfk ? p.activeHours : p.hours;
    if (minHours !== null && hours < minHours) return false;
    if (maxHours !== null && hours > maxHours) return false;
    if (activeDays !== null && (p.lastSeen === null || now - p.lastSeen > activeDays * DAY_MS)) return false;
    if (from !== null && (p.firstJoin === null || p.firstJoin < from)) return false;
    if (to !== null && (p.firstJoin === null || p.firstJoin >= to)) return false;
    if (minVotes !== null && p.votes < minVotes) return false;
    if (f.withDiscord && !p.hasDiscord) return false;
    return true;
  });

  if (f.privilege && f.privilege !== "all") {
    const active = await prisma.donatePrivilege.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      select: { nickname: true, tier: true },
    });
    const tierOf = new Map(active.map((a) => [a.nickname.toLowerCase(), a.tier]));
    players = players.filter((p) => {
      const tier = tierOf.get(p.nickname.toLowerCase());
      if (f.privilege === "none") return !tier;
      if (f.privilege === "any") return Boolean(tier);
      return tier === f.privilege;
    });
  }

  if (f.excludeCard?.title?.trim()) {
    const owners = await prisma.achievement.findMany({
      where: { category: f.excludeCard.category.trim(), title: f.excludeCard.title.trim() },
      select: { nickname: true },
    });
    const has = new Set(owners.map((o) => o.nickname.toLowerCase()));
    players = players.filter((p) => !has.has(p.nickname.toLowerCase()));
  }

  return players.sort((a, b) => b.hours - a.hours).map((p) => p.nickname);
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
