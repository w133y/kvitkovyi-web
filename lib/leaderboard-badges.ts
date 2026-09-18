import { prisma } from "./prisma";
import { FLORIST_SYMBOL, FLORIST_COLOR_HEX } from "./minecraft-symbols";

export type LeaderboardPrivilegeIcon = {
  nickname: string;
  symbol: string;
  color: string;
  label: "Флорист" | "Меценат";
};

// Active DonatePrivilege rows change rarely (a purchase, an expiry) but this
// ran on every single /leaderboard page load. A short in-memory cache (this
// module stays loaded across requests on the same server process) turns
// "every page view" into "at most once a minute".
let cache: { data: LeaderboardPrivilegeIcon[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

// The leaderboard's own version of the "значок" shown on a profile page —
// the actual custom symbol/color a Меценат picked (Флорист's is fixed),
// pulled from whichever DonatePrivilege row is still active. Same tie-break
// as lib/donate-privileges.ts's getActivePrivilege: a player could in theory
// have both an active FLORIST and MECENAT row, MECENAT wins.
export async function getLeaderboardPrivilegeIcons(): Promise<LeaderboardPrivilegeIcon[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const rows = await prisma.donatePrivilege.findMany({
    where: { expiresAt: { gt: new Date() } },
  });

  const byNickname = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byNickname.get(row.nickname);
    if (!existing || (existing.tier !== "MECENAT" && row.tier === "MECENAT")) {
      byNickname.set(row.nickname, row);
    }
  }

  const data = [...byNickname.values()].map((row) => ({
    nickname: row.nickname,
    symbol: row.tier === "FLORIST" ? FLORIST_SYMBOL : row.iconSymbol || FLORIST_SYMBOL,
    color: row.tier === "FLORIST" ? FLORIST_COLOR_HEX : row.iconColorHex || FLORIST_COLOR_HEX,
    label: row.tier === "FLORIST" ? ("Флорист" as const) : ("Меценат" as const),
  }));

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
