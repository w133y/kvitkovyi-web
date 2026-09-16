import { prisma } from "./prisma";
import { getNicknamesForDiscordIds } from "./mc-db";

export type LeaderboardBadges = {
  owners: Set<string>;
  sponsors: Set<string>;
};

// Owners/sponsors change rarely (an admin promotion, a fulfilled order) but
// this ran on every single /leaderboard page load — 2 Postgres queries plus
// the MySQL discord->nickname resolution, every time. A short in-memory
// cache (this module stays loaded across requests on the same server
// process) turns "every page view" into "at most once a minute".
let cache: { data: LeaderboardBadges; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

// Nicknames hidden from the "Власник" badge specifically — their actual
// admin role (and /admin access) is untouched, this only affects whether
// the leaderboard star shows. Requested temporarily by w1z4r_d; remove the
// entry to bring their badge back.
const HIDDEN_OWNER_BADGES = new Set(["w1z4r_d"]);

// "Власник" (owner/admin) comes from the site's own Postgres User.role,
// which is keyed to a Discord account, not a Minecraft nickname directly —
// resolved via discordsrv_accounts (see getNicknamesForDiscordIds).
// "Спонсор" comes from fulfilled shop orders for a SPONSORSHIP product;
// Order.minecraftNickname is a free-text snapshot captured at checkout, not
// validated against the MC DB, so it's used as-is.
export async function getLeaderboardBadges(): Promise<LeaderboardBadges> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const [admins, sponsorOrders] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { discordId: true } }),
    prisma.order.findMany({
      where: { status: "FULFILLED", items: { some: { product: { category: "SPONSORSHIP" } } } },
      select: { minecraftNickname: true },
    }),
  ]);

  const discordIds = admins.map((a) => a.discordId).filter((id): id is string => !!id);
  const owners = await getNicknamesForDiscordIds(discordIds);
  for (const nickname of HIDDEN_OWNER_BADGES) {
    owners.delete(nickname);
  }
  const sponsors = new Set(
    sponsorOrders.map((o) => o.minecraftNickname).filter((n): n is string => !!n)
  );

  const data = { owners, sponsors };
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
