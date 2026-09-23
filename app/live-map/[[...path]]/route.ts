// Same-origin proxy for the BlueMap live map server (plain HTTP), so it can
// be iframed from an HTTPS page without triggering mixed-content blocking.
// Implemented as a route handler (not a next.config rewrite) so the HTML
// response can be patched with <base href="/live-map/"> — without that,
// BlueMap's own relative asset paths ("./assets/...") resolve incorrectly
// whenever the browser ends up on the no-trailing-slash "/live-map" URL
// (which Next's own routing normalizes to, redirecting away "/live-map/").
import { prisma } from "@/lib/prisma";
import { buildPlayerMarkerSet } from "@/lib/map-markers";

const TARGET = "http://REDACTED:25585";

// BlueMap's webapp polls this file for markers; approved player-suggested
// markers (lib/actions/map-markers.ts) are merged in as their own set here
// rather than written into the server's BlueMap config. Overworld map only.
const MARKERS_PATH = "maps/map/live/markers.json";

// ponytail: per-instance 30s cache so every open map tab polling markers.json
// doesn't hit the DB each time; approvals show up within 30s.
let playerMarkersCache: { at: number; set: ReturnType<typeof buildPlayerMarkerSet> } | null = null;

async function getPlayerMarkerSet() {
  if (playerMarkersCache && Date.now() - playerMarkersCache.at < 30_000) return playerMarkersCache.set;
  const markers = await prisma.mapMarker.findMany({
    where: { status: "APPROVED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: {
      id: true,
      label: true,
      type: true,
      description: true,
      discordInvite: true,
      x: true,
      y: true,
      z: true,
      nickname: true,
      expiresAt: true,
      color: true,
      icon: true,
    },
  });
  const set = buildPlayerMarkerSet(markers);
  playerMarkersCache = { at: Date.now(), set };
  return set;
}

// Headers that don't make sense (or would be wrong) to forward as-is from
// the upstream response.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const subPath = path?.join("/") ?? "";
  const search = new URL(request.url).search;
  const targetUrl = `${TARGET}/${subPath}${search}`;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { headers: { accept: request.headers.get("accept") ?? "*/*" } });
  } catch (err) {
    console.error("live-map proxy: fetch failed", err);
    return new Response("Мапа тимчасово недоступна.", { status: 502 });
  }

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  if (subPath === MARKERS_PATH && upstream.ok) {
    try {
      const sets = (await upstream.json()) as Record<string, unknown>;
      sets["player-markers"] = await getPlayerMarkerSet();
      return Response.json(sets, { status: upstream.status, headers });
    } catch (err) {
      console.error("live-map proxy: failed to merge player markers", err);
      return new Response("{}", { status: 502, headers });
    }
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    // Plus the site's popup styles for player markers (public/map-popup.css)
    // and its font, so marker popups match the rest of the site.
    const html = (await upstream.text()).replace(
      "<head>",
      '<head><base href="/live-map/">' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ubuntu+Sans:wght@400..800&display=swap">' +
        '<link rel="stylesheet" href="/map-popup.css">'
    );
    return new Response(html, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
