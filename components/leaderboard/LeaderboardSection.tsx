import Link from "next/link";
import { getLeaderboardPrivilegeIcons } from "@/lib/leaderboard-badges";
import LazyLeaderboardTable from "./LazyLeaderboardTable";

export default async function LeaderboardSection({ limit }: { limit?: number }) {
  const privilegeIcons = await getLeaderboardPrivilegeIcons();

  return (
    <div className="box2" id="leaderboard">
      <div className="lbheader">
        <h2>
          <b>Топ гравців</b>
        </h2>
        <p>
          Теж мрієш сюди потрапити? Свою пригоду на <b>квітковому</b> можна розпочати вже зараз.
        </p>
      </div>
      <div className="lb">
        <LazyLeaderboardTable limit={limit} privilegeIcons={privilegeIcons} />
      </div>
      <Link href="/leaderboard" className="custom-button lb-full-link">
        <i className="fa-solid fa-ranking-star"></i>
        <span>Повний рейтинг</span>
      </Link>
    </div>
  );
}
