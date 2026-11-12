// "Активний гравець" — who may vote on suggestions (lib/suggestions.ts) and
// wears the Discord role of that name (synced by /api/cron/active-players).
// The rule, as the owner set it, by month of the current season:
// - month 1: anyone with a Minecraft account linked to Discord (DiscordSRV);
// - months 2-3: 5 h played this season per month gone (5, then 10);
// - from month 4: that plus 15 h, at least 15 of them in the last 3 months
//   (month 4: 30 h).
// Playtime comes from Plan's sessions, so it doesn't depend on the server's
// own counters being reset.

import { getCurrentSeason } from "@/lib/seasons";
import { getDiscordLink, getPlayMsSince, listDiscordLinks } from "@/lib/mc-db";
import { addGuildMemberRole, ensureGuildRole, listGuildMemberRoles, removeGuildMemberRole } from "@/lib/discord";

export const ACTIVE_ROLE_NAME = "Активний гравець";
const HOUR_MS = 3_600_000;
const RECENT_MS = 90 * 24 * HOUR_MS;

// Month N of the season: 1 until the same date next month, and so on.
export function seasonMonth(startedAt: Date, now = new Date()): number {
  let month = 1;
  const boundary = new Date(startedAt);
  for (;;) {
    boundary.setMonth(boundary.getMonth() + 1);
    if (boundary > now) return month;
    month++;
  }
}

export function activeRequirement(month: number): { seasonHours: number; recentHours: number } {
  if (month <= 1) return { seasonHours: 0, recentHours: 0 };
  if (month <= 3) return { seasonHours: 5 * (month - 1), recentHours: 0 };
  return { seasonHours: 5 * (month - 1) + 15, recentHours: 15 };
}

export type ActiveCheck = { ok: true } | { ok: false; reason: string };

const hours = (ms: number) => Math.floor(ms / (HOUR_MS / 10)) / 10;

function judge(month: number, seasonMs: number, recentMs: number): ActiveCheck {
  const need = activeRequirement(month);
  if (seasonMs < need.seasonHours * HOUR_MS) {
    return {
      ok: false,
      reason: `зараз ${month}-й місяць сезону, тож потрібно ${need.seasonHours} год гри в цьому сезоні — у тебе ${hours(seasonMs)} год.`,
    };
  }
  if (recentMs < need.recentHours * HOUR_MS) {
    return {
      ok: false,
      reason: `потрібно ще й ${need.recentHours} год гри за останні 3 місяці — у тебе ${hours(recentMs)} год.`,
    };
  }
  return { ok: true };
}

function windows(startedAt: Date): [number, number] {
  const start = startedAt.getTime();
  return [start, Math.max(start, Date.now() - RECENT_MS)];
}

// Throws when the Minecraft DB can't be read — the caller says "try again".
export async function checkActivePlayer(discordId: string): Promise<ActiveCheck> {
  const link = await getDiscordLink(discordId);
  if (!link) {
    return { ok: false, reason: "твій Discord не привʼязаний до акаунта Minecraft. Напиши в грі /discord link." };
  }
  const season = await getCurrentSeason();
  const month = seasonMonth(season.startedAt);
  if (month === 1) return { ok: true };
  const uuid = link.minecraftUuid.toLowerCase();
  const [seasonFrom, recentFrom] = windows(season.startedAt);
  const [inSeason, recent] = await Promise.all([
    getPlayMsSince(seasonFrom, link.minecraftUuid),
    getPlayMsSince(recentFrom, link.minecraftUuid),
  ]);
  return judge(month, inSeason.get(uuid) ?? 0, recent.get(uuid) ?? 0);
}

// Gives the role to everyone who qualifies and takes it from everyone else.
export async function syncActivePlayerRole(): Promise<{ active: number; added: number; removed: number }> {
  const season = await getCurrentSeason();
  const month = seasonMonth(season.startedAt);
  const links = await listDiscordLinks();
  // An empty list means a broken read, not "nobody is linked" — don't strip everyone.
  if (links.size === 0) throw new Error("active-players: no linked accounts read");
  const [seasonFrom, recentFrom] = windows(season.startedAt);
  const [inSeason, recent] =
    month === 1 ? [new Map<string, number>(), new Map<string, number>()] : await Promise.all([getPlayMsSince(seasonFrom), getPlayMsSince(recentFrom)]);

  const active = new Set<string>();
  for (const [discordId, link] of links) {
    const uuid = link.minecraftUuid.toLowerCase();
    if (month === 1 || judge(month, inSeason.get(uuid) ?? 0, recent.get(uuid) ?? 0).ok) active.add(discordId);
  }

  const roleId = await ensureGuildRole(ACTIVE_ROLE_NAME, 0x3ecf6e);
  let added = 0;
  let removed = 0;
  for (const [memberId, roles] of await listGuildMemberRoles()) {
    const has = roles.includes(roleId);
    if (active.has(memberId) && !has) {
      await addGuildMemberRole(memberId, roleId);
      added++;
    } else if (!active.has(memberId) && has) {
      await removeGuildMemberRole(memberId, roleId);
      removed++;
    }
  }
  return { active: active.size, added, removed };
}
