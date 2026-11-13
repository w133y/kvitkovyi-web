"use server";

import type { SeasonRewards } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminTab } from "@/lib/admin-scopes";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, getSeasonRewards } from "@/lib/seasons";
import { activeRequirement, seasonMonth, syncActivePlayerRole } from "@/lib/active-players";
import { logError } from "@/lib/admin-log";

const kyivDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });

export type SeasonAdminData = {
  number: number;
  startedOn: string; // YYYY-MM-DD, Kyiv
  month: number;
  requirement: { seasonHours: number; recentHours: number };
  pendingSeason: number | null;
  rewards: SeasonRewards;
};

export async function getSeasonAdminData(): Promise<SeasonAdminData> {
  await requireAdminTab("season");
  const [season, settings, rewards] = await Promise.all([
    getCurrentSeason(),
    prisma.gallerySettings.findUnique({ where: { id: "default" } }),
    getSeasonRewards(),
  ]);
  const month = seasonMonth(season.startedAt);
  return {
    number: season.number,
    startedOn: kyivDate(season.startedAt),
    month,
    requirement: activeRequirement(month),
    pendingSeason: settings?.pendingSeason ?? null,
    rewards,
  };
}

// Midnight of `date` (YYYY-MM-DD) in Kyiv.
function kyivMidnight(date: string): Date {
  const utc = new Date(`${date}T00:00:00Z`);
  const asKyiv = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const asUtc = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (asKyiv.getTime() - asUtc.getTime()));
}

export async function updateSeasonStart(date: string): Promise<{ ok: true } | { error: string }> {
  await requireAdminTab("season");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "Невірна дата" };
  const startedAt = kyivMidnight(date);
  if (startedAt > new Date()) return { error: "Дата не може бути в майбутньому" };
  const season = await getCurrentSeason();
  await prisma.season.update({ where: { number: season.number }, data: { startedAt } });
  revalidatePath("/admin");
  return { ok: true };
}

export type SeasonRewardsInput = Omit<SeasonRewards, "id">;

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function updateSeasonRewards(input: SeasonRewardsInput): Promise<{ ok: true } | { error: string }> {
  await requireAdminTab("season");
  const counts = [input.minHours, input.topCount, input.podiumCount];
  if (counts.some((n) => !Number.isInteger(n) || n < 0 || n > 10_000)) return { error: "Числа мають бути цілими, від 0" };
  if (input.podiumCount > input.topCount) return { error: "Топ-3 не може бути більшим за топ-10" };
  const labels = [input.playerLabel, input.topLabel, input.podiumLabel];
  if (labels.some((l) => !l.trim() || l.length > 30)) return { error: "Підписи — від 1 до 30 символів" };
  const icons = [input.playerIcon, input.topIcon, input.podiumIcon];
  if (icons.some((i) => !i.trim() || i.length > 16)) return { error: "Іконка — емодзі, до 16 символів" };
  const colors = [input.playerColor, input.topColor, input.podiumColor];
  if (colors.some((c) => !COLOR_RE.test(c))) return { error: "Колір — у форматі #RRGGBB" };

  const data = {
    minHours: input.minHours,
    topCount: input.topCount,
    podiumCount: input.podiumCount,
    playerLabel: input.playerLabel.trim(),
    topLabel: input.topLabel.trim(),
    podiumLabel: input.podiumLabel.trim(),
    playerIcon: input.playerIcon.trim(),
    topIcon: input.topIcon.trim(),
    podiumIcon: input.podiumIcon.trim(),
    playerColor: input.playerColor,
    topColor: input.topColor,
    podiumColor: input.podiumColor,
  };
  await prisma.seasonRewards.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
  revalidatePath("/admin");
  return { ok: true };
}

// The same sync the hourly cron runs, on demand.
export async function syncActiveRoleNow(): Promise<{ ok: string } | { error: string }> {
  await requireAdminTab("season");
  try {
    const r = await syncActivePlayerRole();
    return { ok: `Активних гравців: ${r.active}. Роль видано: ${r.added}, знято: ${r.removed}.` };
  } catch (err) {
    await logError("active-players: manual sync failed", err);
    return { error: "Не вдалося оновити роль — подробиці в журналі помилок" };
  }
}
