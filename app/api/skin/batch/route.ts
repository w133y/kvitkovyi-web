import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";

const MAX_UUIDS = 50;

// Batched version of /api/skin/[uuid] — the /leaderboard page used to have
// every row's LazyPlayerAvatar fire its own request (20+ separate round
// trips, each its own DB lookup and possibly a Mojang API call, on every
// page load or sort change). This resolves a whole page's worth of skins
// in one request, with the per-uuid lookups still run in parallel
// server-side, instead of the client fanning them out itself.
export async function POST(request: Request) {
  const { uuids } = (await request.json().catch(() => ({}))) as { uuids?: unknown };

  if (!Array.isArray(uuids)) {
    return Response.json({ skins: {} }, { status: 400 });
  }

  const unique = [...new Set(uuids.filter((u): u is string => typeof u === "string"))].slice(0, MAX_UUIDS);

  const resolved = await Promise.all(
    unique.map(async (uuid) => {
      const texture = (await getSkinTexture(uuid)) ?? STEVE_SKIN;
      return [uuid, texture.skinUrl] as const;
    })
  );

  return Response.json(
    { skins: Object.fromEntries(resolved) },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
