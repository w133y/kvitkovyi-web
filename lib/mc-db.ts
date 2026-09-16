import mysql from "mysql2/promise";
import crypto from "crypto";
import { logError } from "@/lib/admin-log";

// Read-only access to the Minecraft server's existing MySQL DB (populated by
// server plugins). Never write to this DB — new site data belongs in the
// site's own Postgres DB (see lib/prisma.ts), not here.
//
// The pool lives on globalThis (same trick lib/prisma.ts uses for
// PrismaClient) rather than a plain module-level variable. In dev, Next.js
// hot-reloads this module on nearly every save; a plain `let pool` loses its
// reference to the old mysql2 pool each time without ever closing it, so
// every edit leaked up to 5 open connections against a small remote MySQL
// server. Over a long dev session that adds up fast and plausibly explains
// (or at least contributes to) the recurring ECONNRESET errors from this
// host — globalThis survives the module re-evaluation, so there's only ever
// one real pool per process.
const globalForMcDbPool = globalThis as unknown as { mcDbPool?: mysql.Pool };

function getPool() {
  if (!globalForMcDbPool.mcDbPool) {
    globalForMcDbPool.mcDbPool = mysql.createPool({
      host: process.env.MC_DB_HOST,
      port: Number(process.env.MC_DB_PORT ?? 3306),
      user: process.env.MC_DB_USER,
      password: process.env.MC_DB_PASSWORD,
      database: process.env.MC_DB_NAME,
      connectionLimit: 5,
      connectTimeout: 8000,
    });
  }
  return globalForMcDbPool.mcDbPool;
}

// This DB's connection drops mid-query often enough (ECONNRESET, on this
// specific remote host) that a single query failing here reads to users as
// "sorting/search is broken" rather than the transient network blip it
// actually is — a plain retry almost always succeeds. Scoped to connection-
// level errors only, not query/syntax errors, which should fail immediately.
async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    const isConnectionError = code === "ECONNRESET" || code === "PROTOCOL_CONNECTION_LOST" || code === "ETIMEDOUT";
    if (retries > 0 && isConnectionError) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

// getDiscordLink and getSkinsRestorerSkin run on every server-rendered page
// for every logged-in visitor (see components/auth/UserMenu.tsx, itself
// rendered from the root layout) — by far the two hottest queries against
// this DB. Both resolve identity/skin data that changes rarely (a re-link,
// a new skin), so a short cache trades a little staleness for cutting that
// per-navigation query volume way down.
function createTtlCache<V>(ttlMs: number) {
  const store = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value;
      if (hit) store.delete(key);
      return undefined;
    },
    set(key: string, value: V) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  uuid: string;
  hours: number;
  minutes: number;
  votes: number;
};

// Ports leaderboard.php's query and tick->time conversion (playtime is
// stored in game ticks, 20 ticks/second). Votes come from VotingPlugin's own
// table (AllTimeTotal) — a separate plugin's data, stored as text, joined by
// uuid with an explicit COLLATE since its collation doesn't match play_time's.
export async function getLeaderboard(limit = 67): Promise<LeaderboardEntry[]> {
  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT pt.nickname, pt.uuid, pt.playtime, vp.AllTimeTotal
         FROM play_time pt
         LEFT JOIN VotingPlugin_Users vp ON vp.uuid COLLATE utf8mb4_unicode_ci = pt.uuid
         ORDER BY pt.playtime DESC
         LIMIT ?`,
        [limit]
      )
    );

    return rows.map((row, i) => {
      const totalMinutes = Math.round(row.playtime / 20 / 60);
      return {
        rank: i + 1,
        nickname: row.nickname as string,
        uuid: row.uuid as string,
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        votes: Number(row.AllTimeTotal) || 0,
      };
    });
  } catch (err) {
    await logError("mc-db: getLeaderboard failed", err);
    return [];
  }
}

// Lightweight nickname-only lookup for admin autocomplete (adding
// achievements) — deliberately not routed through getLeaderboardPage, which
// joins two more tables and computes full stats that an autocomplete
// dropdown has no use for.
export async function searchPlayerNicknames(query: string, limit = 20): Promise<string[]> {
  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT nickname FROM play_time WHERE nickname LIKE ? ORDER BY nickname LIMIT ?`,
        [`%${query.replace(/[%_]/g, "\\$&")}%`, limit]
      )
    );
    return rows.map((row) => row.nickname as string);
  } catch (err) {
    await logError("mc-db: searchPlayerNicknames failed", err);
    return [];
  }
}

export type FullLeaderboardEntry = {
  nickname: string;
  uuid: string;
  totalMinutes: number;
  hours: number;
  minutes: number;
  playerKills: number;
  deaths: number;
  walkKm: number;
  sprintKm: number;
  swimKm: number;
  aviateKm: number;
  votes: number;
  lastSeen: number | null;
};

// Column each sort key orders by — raw ticks/cm rather than the derived
// minutes/km, since the conversion (divide, round) is monotonic and doesn't
// change the order, so there's no need to compute it in SQL. Whitelisted so
// a sort key can be interpolated straight into ORDER BY without risking
// injection: only these exact column expressions ever reach the query.
// Votes is stored as text by VotingPlugin, hence the CAST for a numeric sort.
const LEADERBOARD_SORT_COLUMNS = {
  totalMinutes: "pt.playtime",
  playerKills: "ds.player_kills",
  deaths: "ds.deaths",
  walkKm: "ds.walk_one_cm",
  sprintKm: "ds.sprint_one_cm",
  swimKm: "ds.swim_one_cm",
  aviateKm: "ds.aviate_one_cm",
  votes: "CAST(vp.AllTimeTotal AS UNSIGNED)",
  nickname: "pt.nickname",
} as const;

export type LeaderboardSortKey = keyof typeof LEADERBOARD_SORT_COLUMNS;

export function isLeaderboardSortKey(value: string): value is LeaderboardSortKey {
  return Object.hasOwn(LEADERBOARD_SORT_COLUMNS, value);
}

export type LeaderboardSortDirection = "asc" | "desc";

export type LeaderboardPageOptions = {
  // Substring match against nickname (case-insensitive) — the /leaderboard
  // search box. Runs in SQL so it can find a player regardless of which
  // page they'd otherwise fall on.
  search?: string;
  direction?: LeaderboardSortDirection;
  // The total only changes when `search` changes — switching sort key or
  // direction, or loading another page of the same search, re-orders or
  // extends the same result set without changing how many rows match. The
  // API route only asks for a recount when the search term actually
  // changed, skipping a full COUNT(*) scan on every sort click.
  withCount?: boolean;
};

type LeaderboardPageResult = { entries: FullLeaderboardEntry[]; total: number | null; error: boolean };

// The /leaderboard page's server render (app/(site)/leaderboard/page.tsx)
// calls this directly — not through the API route — so it never benefits
// from that route's HTTP Cache-Control header. A short in-memory cache
// here covers that gap: every visitor landing on the default view (or any
// other exact same query) within a few seconds reuses one DB round trip
// instead of each triggering their own. Only successful results are
// cached, so a transient connection drop (see withRetry above) never gets
// "stuck" as a cached empty result.
const pageCache = new Map<string, { data: LeaderboardPageResult; expiresAt: number }>();
const PAGE_CACHE_TTL_MS = 10_000;

function pageCacheKey(sortKey: LeaderboardSortKey, offset: number, limit: number, options: LeaderboardPageOptions) {
  return `${sortKey}|${offset}|${limit}|${options.direction ?? "desc"}|${options.search ?? ""}|${options.withCount ?? true}`;
}

// Paginated + DB-sorted version of the full per-player stats query — the
// /leaderboard page no longer fetches all ~100+ players up front, it loads
// a page at a time (see app/api/leaderboard) ordered by whichever stat the
// visitor picked, with "total" letting the client know when to stop
// offering "load more".
export async function getLeaderboardPage(
  sortKey: LeaderboardSortKey,
  offset: number,
  limit: number,
  options: LeaderboardPageOptions = {}
): Promise<LeaderboardPageResult> {
  const cacheKey = pageCacheKey(sortKey, offset, limit, options);
  const cached = pageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const result = await getLeaderboardPageUncached(sortKey, offset, limit, options);
  if (!result.error) {
    pageCache.set(cacheKey, { data: result, expiresAt: Date.now() + PAGE_CACHE_TTL_MS });
  }
  return result;
}

async function getLeaderboardPageUncached(
  sortKey: LeaderboardSortKey,
  offset: number,
  limit: number,
  options: LeaderboardPageOptions = {}
): Promise<LeaderboardPageResult> {
  try {
    const column = LEADERBOARD_SORT_COLUMNS[sortKey];
    const direction = options.direction === "asc" ? "ASC" : "DESC";
    const { search, withCount = true } = options;

    const whereClauses: string[] = [];
    const whereParams: unknown[] = [];
    if (search) {
      whereClauses.push("pt.nickname LIKE ?");
      whereParams.push(`%${search.replace(/[%_]/g, "\\$&")}%`);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    let total: number | null = null;
    if (withCount) {
      const [countRows] = await withRetry(() =>
        getPool().query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM play_time pt ${whereSql}`,
          whereParams
        )
      );
      total = Number(countRows[0]?.total ?? 0);
    }

    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT
           pt.nickname, pt.uuid, pt.playtime, pt.last_seen,
           ds.player_kills, ds.deaths,
           ds.walk_one_cm, ds.sprint_one_cm, ds.swim_one_cm, ds.aviate_one_cm,
           vp.AllTimeTotal
         FROM play_time pt
         LEFT JOIN defstats_player_stats ds ON ds.uuid = pt.uuid COLLATE utf8mb4_general_ci
         LEFT JOIN VotingPlugin_Users vp ON vp.uuid COLLATE utf8mb4_unicode_ci = pt.uuid
         ${whereSql}
         ORDER BY ${column} ${direction}
         LIMIT ? OFFSET ?`,
        [...whereParams, limit, offset]
      )
    );

    const cmToKm = (cm: unknown) => Math.round((Number(cm ?? 0) / 100000) * 10) / 10;

    const entries = rows.map((row) => {
      const totalMinutes = Math.round(row.playtime / 20 / 60);
      return {
        nickname: row.nickname as string,
        uuid: row.uuid as string,
        totalMinutes,
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        playerKills: Number(row.player_kills ?? 0),
        deaths: Number(row.deaths ?? 0),
        walkKm: cmToKm(row.walk_one_cm),
        sprintKm: cmToKm(row.sprint_one_cm),
        swimKm: cmToKm(row.swim_one_cm),
        aviateKm: cmToKm(row.aviate_one_cm),
        votes: Number(row.AllTimeTotal) || 0,
        lastSeen: row.last_seen ?? null,
      };
    });

    return { entries, total, error: false };
  } catch (err) {
    await logError("mc-db: getLeaderboardPage failed", err);
    // error:true (rather than just an empty result) lets the API route
    // return a non-200 status, so the client can tell "the query genuinely
    // matched nothing" apart from "the request failed" instead of both
    // looking like an empty leaderboard.
    return { entries: [], total: 0, error: true };
  }
}

// Bulk version of getDiscordLink's two-step resolution (primary join, then
// the offline-mode UUID fallback), for resolving many Discord ids to
// nicknames at once — e.g. every ADMIN's nickname for the leaderboard's
// "Власник" badge/filter — instead of one query per id. The fallback isn't
// a rare edge case in practice: the server's own admin account currently
// needs it (linked back when the server ran offline-mode).
export async function getNicknamesForDiscordIds(discordIds: string[]): Promise<Set<string>> {
  if (discordIds.length === 0) return new Set();
  try {
    const result = new Set<string>();

    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT d.discord, p.name
         FROM discordsrv_accounts d
         JOIN plan_users p ON p.uuid = d.uuid
         WHERE d.discord IN (${discordIds.map(() => "?").join(",")})`,
        discordIds
      )
    );
    const resolved = new Set<string>();
    for (const row of rows) {
      result.add(row.name as string);
      resolved.add(row.discord as string);
    }

    const unresolved = discordIds.filter((id) => !resolved.has(id));
    if (unresolved.length > 0) {
      const [linkRows] = await withRetry(() =>
        getPool().query<mysql.RowDataPacket[]>(
          `SELECT uuid FROM discordsrv_accounts WHERE discord IN (${unresolved.map(() => "?").join(",")})`,
          unresolved
        )
      );
      if (linkRows.length > 0) {
        const storedUuids = new Set(linkRows.map((r) => (r.uuid as string).toLowerCase()));
        const [playerRows] = await withRetry(() =>
          getPool().query<mysql.RowDataPacket[]>("SELECT nickname FROM play_time")
        );
        for (const row of playerRows) {
          const nickname = row.nickname as string;
          if (storedUuids.has(offlineUuid(nickname))) {
            result.add(nickname);
          }
        }
      }
    }

    return result;
  } catch (err) {
    await logError("mc-db: getNicknamesForDiscordIds failed", err);
    return new Set();
  }
}

export type DiscordLink = {
  minecraftUuid: string;
  nickname: string;
};

// Minecraft's offline-mode (cracked) UUID: a version-3 MD5 hash of
// "OfflinePlayer:<name>". Some players linked Discord back when this server
// ran offline-mode, so discordsrv_accounts.uuid can still be this hash
// instead of their real (premium) UUID — see getDiscordLink's fallback.
function offlineUuid(name: string): string {
  const hash = crypto.createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

const DISCORD_LINK_CACHE_TTL_MS = 60_000;
const discordLinkCache = createTtlCache<DiscordLink | null>(DISCORD_LINK_CACHE_TTL_MS);

async function getDiscordLinkUncached(discordId: string): Promise<DiscordLink | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT p.uuid, p.name
     FROM discordsrv_accounts d
     JOIN plan_users p ON p.uuid = d.uuid
     WHERE d.discord = ?
     LIMIT 1`,
    [discordId]
  );
  if (rows.length > 0) {
    return { minecraftUuid: rows[0].uuid as string, nickname: rows[0].name as string };
  }

  const [linkRows] = await getPool().query<mysql.RowDataPacket[]>(
    "SELECT uuid FROM discordsrv_accounts WHERE discord = ? LIMIT 1",
    [discordId]
  );
  if (linkRows.length === 0) return null;
  const storedUuid = (linkRows[0].uuid as string).toLowerCase();

  const [playerRows] = await getPool().query<mysql.RowDataPacket[]>("SELECT nickname, uuid FROM play_time");
  const match = playerRows.find((row) => offlineUuid(row.nickname as string) === storedUuid);
  if (!match) return null;

  return { minecraftUuid: match.uuid as string, nickname: match.nickname as string };
}

// discordsrv_accounts (link, discord, uuid) maps a Discord user id to the
// player's Minecraft UUID; plan_users (uuid, name, ...) resolves that UUID
// to their current in-game nickname. A discord account with no matching
// plan_users row (never actually joined/tracked by Plan) resolves to null.
export async function getDiscordLink(discordId: string): Promise<DiscordLink | null> {
  const cached = discordLinkCache.get(discordId);
  if (cached !== undefined) return cached;

  try {
    const result = await withRetry(() => getDiscordLinkUncached(discordId));
    discordLinkCache.set(discordId, result);
    return result;
  } catch (err) {
    await logError("mc-db: getDiscordLink failed", err);
    return null;
  }
}

// The reverse of getDiscordLink — given a player (already known, so no
// scan needed), find their linked Discord id. Used by the public profile
// page to show that account's Discord name/avatar when they've opted in
// (see prisma/schema.prisma User.showDiscord and lib/actions/discord.ts).
export async function getDiscordIdForPlayer(uuid: string, nickname: string): Promise<string | null> {
  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        "SELECT discord FROM discordsrv_accounts WHERE uuid = ? LIMIT 1",
        [uuid]
      )
    );
    if (rows.length > 0) return rows[0].discord as string;

    // Offline-mode fallback: this account may have linked back when the
    // server ran offline-mode, storing a hash of the nickname instead of
    // the player's real uuid (see offlineUuid above).
    const [offlineRows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        "SELECT discord FROM discordsrv_accounts WHERE uuid = ? LIMIT 1",
        [offlineUuid(nickname)]
      )
    );
    return offlineRows.length > 0 ? (offlineRows[0].discord as string) : null;
  } catch (err) {
    await logError("mc-db: getDiscordIdForPlayer failed", err);
    return null;
  }
}

// Nickname-only version of getDiscordIdForPlayer above, for callers (the
// donate-privilege grant/revoke flow) that only have a nickname on hand —
// looks the uuid up first, then delegates so the same offline-mode
// fallback applies.
export async function getDiscordIdForNickname(nickname: string): Promise<string | null> {
  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        "SELECT uuid FROM play_time WHERE nickname = ? LIMIT 1",
        [nickname]
      )
    );
    const uuid = rows.length > 0 ? (rows[0].uuid as string) : "";
    return getDiscordIdForPlayer(uuid, nickname);
  } catch (err) {
    await logError("mc-db: getDiscordIdForNickname failed", err);
    return null;
  }
}

export type PlaytimeEntry = { hours: number; minutes: number };

export async function getPlaytimeByNickname(nickname: string): Promise<PlaytimeEntry | null> {
  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        "SELECT playtime FROM play_time WHERE nickname = ? LIMIT 1",
        [nickname]
      )
    );
    if (rows.length === 0) return null;
    const totalMinutes = Math.round(rows[0].playtime / 20 / 60);
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  } catch (err) {
    await logError("mc-db: getPlaytimeByNickname failed", err);
    return null;
  }
}

export type PublicPlayerProfile = {
  nickname: string;
  uuid: string;
  hours: number;
  minutes: number;
  firstJoin: number | null;
  lastSeen: number | null;
  playerKills: number;
  deaths: number;
  timesKicked: number;
  sessions: number;
  walkKm: number;
  sprintKm: number;
  swimKm: number;
  aviateKm: number;
};

// The heaviest query in this file — a 3-way LEFT JOIN with a GROUP BY/COUNT
// — hit on every single /profile/[nickname] view (the page can't rely on
// Next's ISR cache for this, since it also reads the session cookie via
// auth(), which forces the whole route to render dynamically on every
// request regardless of `export const revalidate`). A short cache here is
// what actually saves the repeat work.
const PROFILE_CACHE_TTL_MS = 60_000;
const profileCache = createTtlCache<PublicPlayerProfile | null>(PROFILE_CACHE_TTL_MS);

// Public lookup by in-game nickname — anyone can view a player's basic
// stats at /profile/[nickname], no login required. Nickname match is exact
// against play_time.nickname (same source the leaderboard uses), which also
// provides first_join/last_seen (defstats_player_stats has neither).
// Kills/deaths/distances come from defstats_player_stats — a mirror of
// vanilla Minecraft's own per-player statistics (Bukkit Statistic enum),
// which is exact, unlike Plan's session-log based approximation.
export async function getPlayerProfileByNickname(
  nickname: string
): Promise<PublicPlayerProfile | null> {
  const cached = profileCache.get(nickname);
  if (cached !== undefined) return cached;

  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT
           pt.nickname, pt.uuid, pt.playtime, pt.first_join, pt.last_seen,
           pu.times_kicked,
           COUNT(ps.id) AS sessions,
           ds.player_kills, ds.deaths,
           ds.walk_one_cm, ds.sprint_one_cm, ds.swim_one_cm, ds.aviate_one_cm
         FROM play_time pt
         LEFT JOIN plan_users pu ON pu.uuid = pt.uuid COLLATE utf8mb4_general_ci
         LEFT JOIN plan_sessions ps ON ps.user_id = pu.id
         LEFT JOIN defstats_player_stats ds ON ds.uuid = pt.uuid COLLATE utf8mb4_general_ci
         WHERE pt.nickname = ?
         GROUP BY pt.nickname, pt.uuid, pt.playtime, pt.first_join, pt.last_seen, pu.times_kicked,
           ds.player_kills, ds.deaths, ds.walk_one_cm, ds.sprint_one_cm, ds.swim_one_cm, ds.aviate_one_cm
         LIMIT 1`,
        [nickname]
      )
    );
    if (rows.length === 0) {
      profileCache.set(nickname, null);
      return null;
    }
    const row = rows[0];

    const totalMinutes = Math.round(row.playtime / 20 / 60);
    const cmToKm = (cm: unknown) => Math.round((Number(cm ?? 0) / 100000) * 10) / 10;

    const profile: PublicPlayerProfile = {
      nickname: row.nickname as string,
      uuid: row.uuid as string,
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      firstJoin: row.first_join ?? null,
      lastSeen: row.last_seen ?? null,
      playerKills: Number(row.player_kills ?? 0),
      deaths: Number(row.deaths ?? 0),
      timesKicked: Number(row.times_kicked ?? 0),
      sessions: Number(row.sessions ?? 0),
      walkKm: cmToKm(row.walk_one_cm),
      sprintKm: cmToKm(row.sprint_one_cm),
      swimKm: cmToKm(row.swim_one_cm),
      aviateKm: cmToKm(row.aviate_one_cm),
    };
    profileCache.set(nickname, profile);
    return profile;
  } catch (err) {
    await logError("mc-db: getPlayerProfileByNickname failed", err);
    return null;
  }
}

const PLAYTIME_RANK_CACHE_TTL_MS = 60_000;
const playtimeRankCache = createTtlCache<number | null>(PLAYTIME_RANK_CACHE_TTL_MS);

// This player's position in the "Час у грі" leaderboard sort (1 = most
// playtime) — a count of players ahead of them rather than fetching and
// sorting the whole table, since all we need is the one number for the
// profile page's rank badge.
export async function getPlaytimeRank(nickname: string): Promise<number | null> {
  const cached = playtimeRankCache.get(nickname);
  if (cached !== undefined) return cached;

  try {
    const [rows] = await withRetry(() =>
      getPool().query<mysql.RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM play_time WHERE playtime > target.playtime) + 1 AS player_rank
         FROM play_time target
         WHERE target.nickname = ?
         LIMIT 1`,
        [nickname]
      )
    );
    const rank = rows.length > 0 ? Number(rows[0].player_rank) : null;
    playtimeRankCache.set(nickname, rank);
    return rank;
  } catch (err) {
    await logError("mc-db: getPlaytimeRank failed", err);
    return null;
  }
}

export type SkinsRestorerSkin = {
  value: string;
  signature: string;
};

// sr_player_skins (SkinsRestorer plugin) holds whatever skin a player has
// actively set in-game, in the same base64 texture-property format Mojang's
// session server uses. This is the source of truth for offline/cracked
// accounts (which have no real Mojang skin to fall back to), and can also
// override a premium player's skin if they've set a custom one.
const SKIN_CACHE_TTL_MS = 60_000;
const skinCache = createTtlCache<SkinsRestorerSkin | null>(SKIN_CACHE_TTL_MS);

export async function getSkinsRestorerSkin(uuid: string): Promise<SkinsRestorerSkin | null> {
  const cached = skinCache.get(uuid);
  if (cached !== undefined) return cached;

  try {
    const result = await withRetry(async () => {
      const [rows] = await getPool().query<mysql.RowDataPacket[]>(
        "SELECT value, signature FROM sr_player_skins WHERE uuid = ? LIMIT 1",
        [uuid]
      );
      if (rows.length === 0) return null;
      return { value: rows[0].value as string, signature: rows[0].signature as string };
    });
    skinCache.set(uuid, result);
    return result;
  } catch (err) {
    await logError("mc-db: getSkinsRestorerSkin failed", err);
    return null;
  }
}
