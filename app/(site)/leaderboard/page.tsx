import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboardPrivilegeIcons } from "@/lib/leaderboard-badges";
import LeaderboardClient from "@/components/leaderboard/LeaderboardClient";

export const metadata: Metadata = {
  title: "Топ гравців - Квітковий",
};

// Entries are no longer fetched server-side — the client checks its own
// localStorage cache first (15 min TTL, see LeaderboardClient) and only
// hits /api/leaderboard when that's missing or stale, which is what
// actually lets a repeat visit within that window cost the server nothing.
// A first-time visitor (no cache yet) still triggers exactly one fetch, the
// same as before. Privilege icons stay server-rendered — they're cheap
// (in-memory cached, see lib/leaderboard-badges.ts) and needed immediately
// regardless of whether the entries cache hits.
export default async function LeaderboardPage() {
  const privilegeIcons = await getLeaderboardPrivilegeIcons();

  return (
    <>
      <div className="leaderboard-back-wrap">
        <Link href="/#leaderboard" className="back-link back-link-floating">
          <i className="fa-solid fa-arrow-left"></i>
          Назад
        </Link>
        <h2 className="leaderboard-top-title">
          <b>Таблиця лідерів</b>
        </h2>
      </div>
      <LeaderboardClient initialPrivilegeIcons={privilegeIcons} />
    </>
  );
}
