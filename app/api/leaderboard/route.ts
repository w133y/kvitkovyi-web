import { getLeaderboardPage, isLeaderboardSortKey } from "@/lib/mc-db";

// Backs the /leaderboard page's search box, sort list, direction toggle,
// and "Завантажити ще" button — each page (20 initially, then 10 at a
// time) is fetched here instead of the server sending every player up
// front, and search runs in SQL (via nickname LIKE) so it finds matches
// regardless of which page they'd otherwise fall on.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort") ?? "totalMinutes";
  const sortKey = isLeaderboardSortKey(sortParam) ? sortParam : "totalMinutes";

  const direction = searchParams.get("direction") === "asc" ? "asc" : "desc";

  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));

  const search = searchParams.get("search")?.trim() || undefined;

  // The client only sets count=0 when it already knows the total (switching
  // sort/direction, or loading another page of the same search) — see
  // LeaderboardPageOptions.withCount in lib/mc-db.ts for why that recount
  // is unnecessary in those cases.
  const withCount = searchParams.get("count") !== "0";

  const { entries, total, error } = await getLeaderboardPage(sortKey, offset, limit, {
    search,
    direction,
    withCount,
  });

  // A non-200 here (vs. always 200 with an empty list) is what lets the
  // client tell "this query genuinely matched nothing" apart from "the DB
  // request failed" — the remote MC DB drops connections often enough
  // (ECONNRESET) that conflating the two reads as "sorting is broken".
  return Response.json(
    { entries, total },
    {
      status: error ? 503 : 200,
      // Short-lived + stale-while-revalidate: identical repeat requests
      // (e.g. two visitors landing on the default view, or the same user
      // navigating back to it) reuse a cached response for a few seconds
      // instead of re-hitting the DB, without ever showing data that's
      // more than a few seconds stale.
      headers: error ? {} : { "Cache-Control": "public, max-age=10, stale-while-revalidate=30" },
    }
  );
}
