// Serves a map marker's custom logo image (stored as a validated data: URI
// on the marker) — used by the marker popup on the map and as the Discord
// review message thumbnail, so moderators see the image they're approving.

import { prisma } from "@/lib/prisma";
import { MARKER_IMAGE_RE } from "@/lib/map-markers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marker = await prisma.mapMarker.findUnique({ where: { id }, select: { iconImage: true } });
  const image = marker?.iconImage;
  if (!image || !MARKER_IMAGE_RE.test(image)) return new Response("Not found", { status: 404 });

  const [, mime, data] = /^data:([^;]+);base64,(.+)$/.exec(image)!;
  return new Response(Buffer.from(data, "base64"), {
    headers: {
      "content-type": mime,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
