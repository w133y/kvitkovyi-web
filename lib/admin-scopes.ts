import { auth } from "@/lib/auth";

// Site admins kept out of the panel's "Сезон і сервер" tab — the season
// change, the server address and the site sections — by Discord id.
const NO_SEASON_AND_SERVER_DISCORD_IDS = [
  "1375438624929349735", // mrailak (mars)
];

export function canManageSeasonAndServer(discordId: string | null | undefined): boolean {
  return !!discordId && !NO_SEASON_AND_SERVER_DISCORD_IDS.includes(discordId);
}

// For the server actions behind that tab: hiding it isn't enough, they can be
// called directly.
export async function requireSeasonAndServerAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !canManageSeasonAndServer(session.user.discordId)) {
    throw new Error("Доступ заборонено");
  }
  return session;
}
