"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FullLeaderboardEntry } from "@/lib/mc-db";
import PlayerAvatar from "./PlayerAvatar";

function rankClass(rank: number) {
  if (rank === 1) return "rank-1";
  if (rank === 2) return "rank-2";
  if (rank === 3) return "rank-3";
  return "rank-default";
}

// Client-side twin of LeaderboardTable (the homepage widget's original
// Server Component) — the DB query + skin lookups only used to run on every
// homepage load even though this section sits below the fold. This defers
// both until the widget actually scrolls near the viewport, reusing the same
// /api/leaderboard + /api/skin/batch endpoints the full /leaderboard page
// already relies on (see LeaderboardClient.tsx) instead of a new data path.
export default function LazyLeaderboardTable({ limit = 5 }: { limit?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState<FullLeaderboardEntry[] | null>(null);
  const [skins, setSkins] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // rootMargin starts the fetch a little before the widget is actually on
    // screen, so it's ready by the time someone scrolls the rest of the way.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    fetch(`/api/leaderboard?limit=${limit}&count=0`)
      .then((res) => res.json())
      .then((data: { entries: FullLeaderboardEntry[] }) => {
        if (cancelled) return;
        setEntries(data.entries);
        const uuids = data.entries.map((e) => e.uuid);
        if (uuids.length === 0) return;
        return fetch("/api/skin/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuids }),
        })
          .then((res) => res.json())
          .then((skinData: { skins?: Record<string, string> }) => {
            if (!cancelled && skinData.skins) setSkins(skinData.skins);
          });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, limit]);

  return (
    <div className="leaderboard" ref={containerRef}>
      <div className="leaderboard-scroll">
        <div className="leaderboard-rows">
          {entries === null ? (
            <div className="lb-empty">{error ? "Не вдалося завантажити" : "Завантаження..."}</div>
          ) : entries.length === 0 ? (
            <div className="lb-empty">Немає даних</div>
          ) : (
            entries.map((entry, i) => (
              <div className="leaderboard-row" key={entry.nickname}>
                <div className={`rank-cell ${rankClass(i + 1)}`}>{i + 1}</div>
                <Link href={`/profile/${entry.nickname}`} className="leaderboard-player-link">
                  <div className="avatar-cell">
                    {skins[entry.uuid] ? (
                      <PlayerAvatar skinUrl={skins[entry.uuid]} />
                    ) : (
                      <div className="leaderboard-avatar leaderboard-avatar-loading" />
                    )}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
