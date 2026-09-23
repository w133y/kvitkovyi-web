import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getDiscordLink } from "@/lib/mc-db";
import MarkerSuggest from "@/components/map/MarkerSuggest";

export const metadata: Metadata = {
  title: "Мапа - Квітковий",
};

// ?x=&y=&z= (the links in the marker review messages) opens BlueMap centered
// there, via its own "#map:x:y:z:distance:…" address format.
function mapHash(params: { x?: string; y?: string; z?: string }): string {
  const [x, y, z] = [params.x, params.y ?? "64", params.z].map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return "";
  return `#map:${x}:${y}:${z}:150:0:0:0:0:perspective`;
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ x?: string; y?: string; z?: string }>;
}) {
  const [params, session] = await Promise.all([searchParams, auth()]);
  const link = session?.user?.discordId ? await getDiscordLink(session.user.discordId) : null;

  return (
    <>
      <iframe
        src={`/live-map/${mapHash(params)}`}
        title="Мапа серверу"
        className="map-frame"
        // dvh, not vh: on iOS 100vh runs under Safari's toolbar, hiding the
        // map's own bottom controls.
        style={{ display: "block", width: "100%", height: "100dvh", border: "none" }}
        allowFullScreen
      />
      <MarkerSuggest signedIn={!!session?.user} hasLink={!!link} />
    </>
  );
}
