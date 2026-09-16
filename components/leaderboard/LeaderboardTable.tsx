import Link from "next/link";
import { getLeaderboard } from "@/lib/mc-db";
import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";
import PlayerAvatar from "./PlayerAvatar";

function rankClass(rank: number) {
  if (rank === 1) return "rank-1";
  if (rank === 2) return "rank-2";
  if (rank === 3) return "rank-3";
  return "rank-default";
}

export default async function LeaderboardTable({ limit = 5 }: { limit?: number }) {
  const entries = await getLeaderboard(limit);

  if (entries.length === 0) {
    return (
      <div className="leaderboard">
        <div className="lb-empty">Немає даних</div>
      </div>
    );
  }

  const skinUrls = await Promise.all(
    entries.map((entry) => getSkinTexture(entry.uuid).then((t) => (t ?? STEVE_SKIN).skinUrl))
  );

  return (
    <div className="leaderboard">
      <div className="leaderboard-scroll">
        <div className="leaderboard-rows">
          {entries.map((entry, i) => (
            <div className="leaderboard-row" key={entry.nickname}>
              <div className={`rank-cell ${rankClass(entry.rank)}`}>{entry.rank}</div>
              <Link href={`/profile/${entry.nickname}`} className="leaderboard-player-link">
                <div className="avatar-cell">
                  <PlayerAvatar skinUrl={skinUrls[i]} />
                </div>
                <div className="name">
                  <span className="name-text">{entry.nickname}</span>
                </div>
              </Link>
              <div className="votes">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/favicon.ico" alt="" className="votes-icon" />
                {entry.votes}
              </div>
              <div className="time">
                {entry.hours}г {entry.minutes}хв
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
