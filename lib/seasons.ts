// Seasons: when one ends, every player's stats are frozen into
// SeasonPlayerStats (the server resets its own counters for the next one),
// and the season's rewards go out — achievement cards by playtime and the
// "Гравець N сезону" Discord role. Started from the Discord confirmation of
// a season change (app/api/discord/interactions/route.ts).

import type { SeasonPlayerStats, SeasonRewards } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/admin-log";
import { addGuildMemberRole, ensureGuildRole } from "@/lib/discord";
import {
  getAllPlayerStatsWithRaw,
  getDiscordIdForPlayer,
  type FullLeaderboardEntry,
  type LeaderboardSortDirection,
  type LeaderboardSortKey,
} from "@/lib/mc-db";

export async function getCurrentSeason(): Promise<{ number: number; startedAt: Date }> {
  const settings = await prisma.gallerySettings.findUnique({ where: { id: "default" } });
  const number = settings?.currentSeason ?? 1;
  return prisma.season.upsert({ where: { number }, update: {}, create: { number, startedAt: new Date() } });
}

// Past seasons that have stats to show, newest first.
export async function listArchivedSeasons(): Promise<number[]> {
  const rows = await prisma.seasonPlayerStats.groupBy({ by: ["season"], orderBy: { season: "desc" } });
  return rows.map((r) => r.season);
}

export async function getSeasonRewards(): Promise<SeasonRewards> {
  return prisma.seasonRewards.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

function toEntry(r: SeasonPlayerStats): FullLeaderboardEntry {
  return {
    nickname: r.nickname,
    uuid: r.uuid,
    totalMinutes: r.totalMinutes,
    hours: Math.floor(r.totalMinutes / 60),
    minutes: r.totalMinutes % 60,
    playerKills: r.playerKills,
    deaths: r.deaths,
    walkKm: r.walkKm,
    sprintKm: r.sprintKm,
    swimKm: r.swimKm,
    aviateKm: r.aviateKm,
    votes: r.votes,
    lastSeen: r.lastSeen === null ? null : Number(r.lastSeen),
  };
}

// The leaderboard of a past season — same sort keys and search as the live one.
export async function getSeasonLeaderboardPage(
  season: number,
  sortKey: LeaderboardSortKey,
  offset: number,
  limit: number,
  options: { search?: string; direction?: LeaderboardSortDirection } = {}
): Promise<{ entries: FullLeaderboardEntry[]; total: number }> {
  const where = {
    season,
    ...(options.search ? { nickname: { contains: options.search, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.seasonPlayerStats.findMany({
      where,
      orderBy: [{ [sortKey]: options.direction ?? "desc" }, { nickname: "asc" }],
      skip: offset,
      take: limit,
    }),
    prisma.seasonPlayerStats.count({ where }),
  ]);
  return { entries: rows.map(toEntry), total };
}

// A player's stats in each past season, newest first.
export async function getPlayerSeasonStats(uuid: string): Promise<(FullLeaderboardEntry & { season: number })[]> {
  const rows = await prisma.seasonPlayerStats.findMany({ where: { uuid }, orderBy: { season: "desc" } });
  return rows.map((r) => ({ ...toEntry(r), season: r.season }));
}

// Ends the current season and starts the next: snapshot first, and only once
// every player is saved does the season number change. Re-running after a
// failure is safe — rows already saved are kept. Returns a summary for Discord.
export async function startNextSeason(): Promise<string> {
  const current = await getCurrentSeason();
  const next = current.number + 1;

  const players = await getAllPlayerStatsWithRaw();
  if (players.length === 0) throw new Error("статистику з сервера не прочитано");
  const unique = [...new Map(players.map((p) => [p.uuid, p])).values()];
  await prisma.seasonPlayerStats.createMany({
    data: unique.map((p) => ({
      season: current.number,
      uuid: p.uuid,
      nickname: p.nickname,
      totalMinutes: p.totalMinutes,
      playerKills: p.playerKills,
      deaths: p.deaths,
      walkKm: p.walkKm,
      sprintKm: p.sprintKm,
      swimKm: p.swimKm,
      aviateKm: p.aviateKm,
      votes: p.votes,
      lastSeen: p.lastSeen === null ? null : BigInt(p.lastSeen),
      raw: p.raw as object,
    })),
    skipDuplicates: true,
  });
  const saved = await prisma.seasonPlayerStats.count({ where: { season: current.number } });
  if (saved < unique.length) throw new Error(`збережено ${saved} з ${unique.length} гравців`);

  const now = new Date();
  await prisma.$transaction([
    prisma.season.update({ where: { number: current.number }, data: { endedAt: now } }),
    prisma.season.upsert({
      where: { number: next },
      update: { startedAt: now, endedAt: null },
      create: { number: next, startedAt: now },
    }),
    prisma.gallerySettings.update({
      where: { id: "default" },
      data: { currentSeason: next, pendingSeason: null, pendingSeasonMessageId: null, pendingSeasonAdminName: null },
    }),
  ]);

  let rewards: string;
  try {
    const { cards, roles } = await grantSeasonRewards(current.number);
    rewards = `видано карток: ${cards}, роль «Гравець ${current.number} сезону»: ${roles}`;
  } catch (err) {
    await logError("seasons: rewards failed", current.number, err);
    rewards = "картки й ролі не видано — помилка в журналі на /admin";
  }
  return `✅ Почався **${next}-й сезон**. Статистику ${current.number}-го збережено (${saved} гравців); ${rewards}.`;
}

// Cards and roles for everyone who played more than minHours in `season`.
// Safe to re-run: a player who already has the card isn't given another.
export async function grantSeasonRewards(season: number): Promise<{ cards: number; roles: number }> {
  const cfg = await getSeasonRewards();
  const rows = await prisma.seasonPlayerStats.findMany({
    where: { season, totalMinutes: { gt: cfg.minHours * 60 } },
    orderBy: { totalMinutes: "desc" },
  });
  const title = `Сезон ${season}`;

  let cards = 0;
  for (const [i, r] of rows.entries()) {
    if (await prisma.achievement.findFirst({ where: { nickname: r.nickname, title } })) continue;
    const place = i + 1;
    const tier =
      place <= cfg.podiumCount
        ? { label: cfg.podiumLabel, icon: cfg.podiumIcon, color: cfg.podiumColor }
        : place <= cfg.topCount
          ? { label: cfg.topLabel, icon: cfg.topIcon, color: cfg.topColor }
          : null;
    await prisma.achievement.create({
      data: {
        nickname: r.nickname,
        category: tier?.label ?? cfg.playerLabel,
        icon: tier?.icon ?? cfg.playerIcon,
        borderColor: tier?.color ?? cfg.playerColor,
        title,
        subtitle: `Награно ${Math.floor(r.totalMinutes / 60)} год${tier ? ` · ${place} місце` : ""}`,
      },
    });
    cards++;
  }

  const roleId = await ensureGuildRole(`Гравець ${season} сезону`, 0x3ecf6e);
  let roles = 0;
  for (const r of rows) {
    const discordId = await getDiscordIdForPlayer(r.uuid, r.nickname);
    if (!discordId) continue;
    await addGuildMemberRole(discordId, roleId);
    roles++;
  }
  return { cards, roles };
}
