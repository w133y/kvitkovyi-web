"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FullLeaderboardEntry } from "@/lib/mc-db";
import { formatLastSeen } from "@/lib/format-last-seen";
import PlayerAvatar from "./PlayerAvatar";

type StatKey =
  | "totalMinutes"
  | "playerKills"
  | "deaths"
  | "walkKm"
  | "sprintKm"
  | "swimKm"
  | "aviateKm"
  | "votes";

type SortMode = "stat" | "alpha";
type Direction = "asc" | "desc";

// Votes uses the site's own flower favicon (same icon the homepage
// leaderboard widget uses for its votes column) instead of a generic
// FontAwesome glyph — everything else stays a FontAwesome class.
const STAT_OPTIONS: { key: StatKey; label: string; icon?: string; iconImg?: string }[] = [
  { key: "totalMinutes", label: "Час у грі", icon: "fa-regular fa-clock" },
  { key: "votes", label: "Голоси", iconImg: "/favicon.ico" },
  { key: "playerKills", label: "Вбивств гравців", icon: "fa-solid fa-skull-crossbones" },
  { key: "deaths", label: "Смертей", icon: "fa-solid fa-heart-crack" },
  { key: "walkKm", label: "Пішки", icon: "fa-solid fa-shoe-prints" },
  { key: "sprintKm", label: "Бігом", icon: "fa-solid fa-person-running" },
  { key: "swimKm", label: "Вплав", icon: "fa-solid fa-water" },
  { key: "aviateKm", label: "На елітрах", icon: "fa-solid fa-paper-plane" },
];

function StatIcon({ opt }: { opt: { icon?: string; iconImg?: string } }) {
  if (opt.iconImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={opt.iconImg} alt="" className="lb2-option-icon-img" />;
  }
  return <i className={opt.icon}></i>;
}

const DEFAULT_STAT: StatKey = "totalMinutes";
const DEFAULT_DIRECTION: Direction = "desc";

function formatValue(entry: FullLeaderboardEntry, key: StatKey) {
  if (key === "totalMinutes") return `${entry.hours}г ${entry.minutes}хв`;
  if (key === "votes") return `${entry.votes} голосів`;
  if (key === "playerKills" || key === "deaths") return String(entry[key]);
  return `${entry[key]} км`;
}

const INITIAL_PAGE_SIZE = 20;
const LOAD_MORE_STEP = 10;

// Caches the default view (time desc, no search — what every fresh visitor
// sees) in the browser so a repeat visit within 15 minutes costs the server
// nothing at all, not even the API route's own short-lived cache. A
// genuinely different visitor always starts with an empty localStorage for
// this origin, so they naturally get a fresh fetch — that's what "or a
// different person visits" reduces to per-browser storage, no cross-client
// signaling needed.
const CACHE_KEY = "kvitkoviy:leaderboard:default";
const CACHE_TTL_MS = 15 * 60 * 1000;

type CachedPage = { entries: FullLeaderboardEntry[]; total: number; cachedAt: number };

function readCache(): CachedPage | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPage;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entries: FullLeaderboardEntry[], total: number) {
  try {
    const payload: CachedPage = { entries, total, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing / storage quota — caching is an optimization, not a
    // requirement, so just skip it silently.
  }
}

async function fetchPage(
  sortKey: string,
  direction: Direction,
  search: string,
  offset: number,
  limit: number,
  withCount: boolean
) {
  const params = new URLSearchParams({
    sort: sortKey,
    direction,
    offset: String(offset),
    limit: String(limit),
  });
  if (search) params.set("search", search);
  if (!withCount) params.set("count", "0");

  const res = await fetch(`/api/leaderboard?${params.toString()}`);
  const data = (await res.json()) as { entries: FullLeaderboardEntry[]; total: number | null };
  return { ...data, ok: res.ok };
}

export default function LeaderboardClient({
  initialOwners,
  initialSponsors,
}: {
  initialOwners: string[];
  initialSponsors: string[];
}) {
  const [sortMode, setSortMode] = useState<SortMode>("stat");
  const [statKey, setStatKey] = useState<StatKey>(DEFAULT_STAT);
  const [direction, setDirection] = useState<Direction>(DEFAULT_DIRECTION);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entries, setEntries] = useState<FullLeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const owners = useMemo(() => new Set(initialOwners), [initialOwners]);
  const sponsors = useMemo(() => new Set(initialSponsors), [initialSponsors]);
  const activeStatOption = STAT_OPTIONS.find((opt) => opt.key === statKey) ?? STAT_OPTIONS[0];

  // Every row used to fetch its own skin individually (20+ separate
  // requests per page load/sort change, each its own DB or Mojang lookup).
  // This resolves a whole page in one request to /api/skin/batch and caches
  // results in a ref (not state) so re-fetching the same player later — a
  // different sort bringing them back into view — is free. skinVersion just
  // forces a re-render when the cache gains new entries.
  const skinCacheRef = useRef<Record<string, string>>({});
  // Read (not just set) below so the JSX has a real dependency on it — that's
  // what makes React actually re-render when the cache gains new entries;
  // the value itself is never displayed.
  const [skinVersion, setSkinVersion] = useState(0);
  void skinVersion;

  useEffect(() => {
    const missing = entries.map((e) => e.uuid).filter((uuid) => !(uuid in skinCacheRef.current));
    if (missing.length === 0) return;

    let cancelled = false;
    fetch("/api/skin/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuids: missing }),
    })
      .then((res) => res.json())
      .then((data: { skins?: Record<string, string> }) => {
        if (cancelled || !data.skins) return;
        Object.assign(skinCacheRef.current, data.skins);
        setSkinVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entries]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const effectiveSortKey = sortMode === "alpha" ? "nickname" : statKey;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Tracks which params the currently-held `entries` actually came from, so
  // the effect only fetches when that's genuinely out of date — not on every
  // invocation. A boolean "already ran once" ref looks equivalent but isn't:
  // React's dev-mode Strict Mode runs an effect, its cleanup, then the same
  // effect again for one real mount, and a boolean flag only blocks the
  // first of those two — the second slips through and fires a redundant
  // fetch for data identical to what SSR already sent, which is exactly the
  // duplicate /api/leaderboard requests seen in the dev server log. A value
  // comparison is idempotent no matter how many times it's invoked.
  const fetchedKeyRef = useRef(`${DEFAULT_STAT}|${DEFAULT_DIRECTION}|`);
  const currentKey = `${effectiveSortKey}|${direction}|${debouncedSearch}`;

  // The total only needs recounting when the search term changes (see
  // LeaderboardPageOptions.withCount in lib/mc-db.ts) — switching sort key,
  // direction, or loading more of the same search reuses this. Starts at ""
  // to match the default view (no search).
  const lastCountedSearchRef = useRef("");

  // Populates the default view on mount — from localStorage when a fresh-
  // enough cache exists (the whole point: a repeat visit within 15 minutes
  // costs the server nothing), otherwise a normal fetch, whose result then
  // seeds the cache for next time. fetchedKeyRef already starts equal to
  // this view's key, so the effect below (which handles later sort/search/
  // direction changes) correctly leaves this alone.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setEntries(cached.entries);
      setTotal(cached.total);
      setInitialLoading(false);
      return;
    }

    let cancelled = false;
    fetchPage(DEFAULT_STAT, DEFAULT_DIRECTION, "", 0, INITIAL_PAGE_SIZE, true).then((data) => {
      if (cancelled) return;
      if (!data.ok) {
        setLoadError(true);
        setInitialLoading(false);
        return;
      }
      const total = data.total ?? 0;
      setEntries(data.entries);
      setTotal(total);
      lastCountedSearchRef.current = "";
      writeCache(data.entries, total);
      setInitialLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentKey === fetchedKeyRef.current) return;
    const previousKey = fetchedKeyRef.current;
    fetchedKeyRef.current = currentKey;
    const withCount = debouncedSearch !== lastCountedSearchRef.current;

    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchPage(effectiveSortKey, direction, debouncedSearch, 0, INITIAL_PAGE_SIZE, withCount).then((data) => {
      if (cancelled) return;
      if (!data.ok) {
        // Leave the key as "not fetched" so a later change back to it (or
        // just retrying) tries again, and keep whatever was already on
        // screen instead of replacing it with an empty "nothing found" —
        // the DB connection dropping mid-query (see lib/mc-db.ts) isn't the
        // same thing as a search/filter genuinely matching nothing.
        fetchedKeyRef.current = previousKey;
        setLoadError(true);
        setLoading(false);
        return;
      }
      setEntries(data.entries);
      if (data.total !== null) {
        setTotal(data.total);
        lastCountedSearchRef.current = debouncedSearch;
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentKey, effectiveSortKey, direction, debouncedSearch]);

  async function handleLoadMore() {
    if (loading || entries.length >= total) return;
    setLoading(true);
    setLoadError(false);
    try {
      // Appending more of the same query never changes the total, so this
      // never needs a recount.
      const data = await fetchPage(effectiveSortKey, direction, debouncedSearch, entries.length, LOAD_MORE_STEP, false);
      if (!data.ok) {
        setLoadError(true);
        return;
      }
      setEntries((prev) => [...prev, ...data.entries]);
    } finally {
      setLoading(false);
    }
  }

  function resetStandard() {
    setSortMode("stat");
    setStatKey(DEFAULT_STAT);
    setDirection(DEFAULT_DIRECTION);
  }

  async function handleRetry() {
    setLoading(true);
    setLoadError(false);
    const data = await fetchPage(effectiveSortKey, direction, debouncedSearch, 0, INITIAL_PAGE_SIZE, true);
    if (!data.ok) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    fetchedKeyRef.current = currentKey;
    setEntries(data.entries);
    if (data.total !== null) {
      setTotal(data.total);
      lastCountedSearchRef.current = debouncedSearch;
    }
    setLoading(false);
  }

  const hasMore = entries.length < total;
  const isStandard = sortMode === "stat" && statKey === DEFAULT_STAT && direction === DEFAULT_DIRECTION;

  return (
    <div className="lb2-layout">
      <aside className="lb2-sidebar">
        <h2 className="lb2-sidebar-title">ЛІДЕРИ</h2>

        <div>
          <span className="lb2-group-label">СОРТУВАННЯ</span>
          <div className="lb2-quick-sort">
            <button
              type="button"
              className={sortMode === "alpha" ? "lb2-icon-btn active" : "lb2-icon-btn"}
              onClick={() => setSortMode("alpha")}
              title="За алфавітом"
            >
              <i className="fa-solid fa-font"></i>
            </button>
            <button
              type="button"
              className={sortMode === "stat" ? "lb2-icon-btn active" : "lb2-icon-btn"}
              onClick={() => setSortMode("stat")}
              title="За показником"
            >
              <i className="fa-solid fa-hashtag"></i>
            </button>
            <button
              type="button"
              className={direction === "asc" ? "lb2-icon-btn active" : "lb2-icon-btn"}
              onClick={() => setDirection("asc")}
              title="За зростанням"
            >
              <i className="fa-solid fa-arrow-up"></i>
            </button>
            <button
              type="button"
              className={direction === "desc" ? "lb2-icon-btn active" : "lb2-icon-btn"}
              onClick={() => setDirection("desc")}
              title="За спаданням"
            >
              <i className="fa-solid fa-arrow-down"></i>
            </button>
            <button
              type="button"
              className={isStandard ? "lb2-icon-btn active" : "lb2-icon-btn"}
              onClick={resetStandard}
              title="Стандартне сортування"
            >
              <i className="fa-solid fa-rotate-left"></i>
            </button>
          </div>
        </div>

        <div>
          <span className="lb2-group-label">ФІЛЬТР</span>
          <div className="lb2-sort-dropdown" ref={sortDropdownRef}>
            <button
              type="button"
              className="lb2-sort-dropdown-toggle"
              onClick={() => setSortDropdownOpen((o) => !o)}
            >
              <span>
                <StatIcon opt={activeStatOption} />
                {activeStatOption.label}
              </span>
              <i className={sortDropdownOpen ? "fa-solid fa-chevron-down open" : "fa-solid fa-chevron-down"}></i>
            </button>
            <div className={sortDropdownOpen ? "lb2-sort-dropdown-menu open" : "lb2-sort-dropdown-menu"}>
              {STAT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={
                    sortMode === "stat" && opt.key === statKey ? "lb2-sort-item active" : "lb2-sort-item"
                  }
                  onClick={() => {
                    setSortMode("stat");
                    setStatKey(opt.key);
                    setSortDropdownOpen(false);
                  }}
                >
                  <StatIcon opt={opt} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="lb2-main">
        <div className="lb2-search lb2-search-top">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Пошук гравця..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loadError && (
          <div className="lb2-load-error">
            Не вдалося завантажити дані — спробуйте ще раз.
            <button type="button" onClick={handleRetry} disabled={loading}>
              Повторити
            </button>
          </div>
        )}

        {initialLoading ? (
          <div className="leaderboard-page-empty">Завантаження...</div>
        ) : entries.length === 0 ? (
          <div className="leaderboard-page-empty">Нічого не знайдено</div>
        ) : (
          <div className="lb2-list">
            {entries.map((entry, i) => (
              <div className="lb2-card" key={entry.nickname}>
                <div className="lb2-rank">#{i + 1}</div>
                {skinCacheRef.current[entry.uuid] ? (
                  <PlayerAvatar skinUrl={skinCacheRef.current[entry.uuid]} size={48} />
                ) : (
                  <div
                    className="leaderboard-avatar leaderboard-avatar-loading"
                    style={{ "--avatar-size": "48px" } as CSSProperties}
                  />
                )}
                <div className="lb2-info">
                  <div className="lb2-name">
                    <Link href={`/profile/${entry.nickname}`}>{entry.nickname}</Link>
                    {owners.has(entry.nickname) && (
                      <i className="fa-solid fa-star lb2-badge lb2-badge-owner" title="Власник"></i>
                    )}
                    {!owners.has(entry.nickname) && sponsors.has(entry.nickname) && (
                      <i className="fa-solid fa-star lb2-badge lb2-badge-sponsor" title="Спонсор"></i>
                    )}
                  </div>
                  <div className="lb2-lastseen">{formatLastSeen(entry.lastSeen)}</div>
                </div>
                <div className="lb2-pill">
                  {statKey === "votes" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/favicon.ico" alt="" className="lb2-pill-icon" />
                  )}
                  {formatValue(entry, statKey)}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            className="leaderboard-load-more"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? "Завантаження..." : "Завантажити ще"}
          </button>
        )}
      </main>
    </div>
  );
}
