import Link from "next/link";
import LazyLeaderboardTable from "./LazyLeaderboardTable";

export default function LeaderboardSection({ limit }: { limit?: number }) {
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
        <LazyLeaderboardTable limit={limit} />
      </div>
      <Link href="/leaderboard" className="custom-button lb-full-link">
        <i className="fa-solid fa-ranking-star"></i>
        <span>Повний рейтинг</span>
      </Link>
    </div>
  );
}
