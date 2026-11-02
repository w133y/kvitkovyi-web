// Proxies a cosmetic's model/texture from the upload store same-origin.
// ModelViewer3D fetches these for WebGL texture upload, which — unlike a plain
// <img src> (how every other stored asset in this app is used, e.g. gallery
// photos) — requires the response to carry CORS headers. Through our own
// origin no CORS is needed at all, so this doesn't depend on the bucket's
// settings.

import { NextRequest, NextResponse } from "next/server";
import { getInternalUrl } from "@/lib/r2";

// Only ever serves cosmetics/ assets — this is a public asset proxy (no
// auth needed, same as the R2 URLs it replaces are already public), but
// still shouldn't become an open fetch-anything-in-the-bucket relay.
const KEY_RE = /^cosmetics\/[A-Za-z0-9_\-./]+$/;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const res = await fetch(getInternalUrl(key));
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
