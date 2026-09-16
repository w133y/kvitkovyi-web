import type { Metadata } from "next";
import { getLeaderboardBadges } from "@/lib/leaderboard-badges";
import LeaderboardClient from "@/components/leaderboard/LeaderboardClient";

export const metadata: Metadata = {
  title: "Топ гравців - Квітковий",
};

// Entries are no longer fetched server-side — the client checks its own
// localStorage cache first (15 min TTL, see LeaderboardClient) and only
// hits /api/leaderboard when that's missing or stale, which is what
// actually lets a repeat visit within that window cost the server nothing.
// A first-time visitor (no cache yet) still triggers exactly one fetch, the
// same as before. Badges (owner/sponsor) stay server-rendered — they're
// cheap (in-memory cached, see lib/leaderboard-badges.ts) and needed
// immediately regardless of whether the entries cache hits.
export default async function LeaderboardPage() {
  const badges = await getLeaderboardBadges();

  return (
    <LeaderboardClient
      initialOwners={[...badges.owners]}
      initialSponsors={[...badges.sponsors]}
    />
  );
}
