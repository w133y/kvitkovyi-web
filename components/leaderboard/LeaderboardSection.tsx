import Link from "next/link";
import { Suspense } from "react";
import LeaderboardTable from "./LeaderboardTable";

export default function LeaderboardSection({ limit }: { limit?: number }) {
  return (
    <div className="box2">
      <div className="lbheader">
        <h2>
          <b>Топ гравців</b>
        </h2>
        <p>
          Теж мрієш сюди потрапити? Свою пригоду на <b>квітковому</b> можна розпочати вже зараз.
        </p>
      </div>
      <div className="lb">
        <Suspense fallback={<div className="lb-empty">Завантаження...</div>}>
          <LeaderboardTable limit={limit} />
        </Suspense>
      </div>
      <Link href="/leaderboard" className="custom-button lb-full-link">
        <i className="fa-solid fa-ranking-star"></i>
        <span>Повний рейтинг</span>
      </Link>
    </div>
  );
}
