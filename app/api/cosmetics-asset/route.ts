// Proxies a cosmetic's model/texture from R2 same-origin. ModelViewer3D
// fetches these for WebGL texture upload, which — unlike a plain <img src>
// (how every other R2-hosted asset in this app is used, e.g. gallery
// photos) — requires the response to carry CORS headers. R2's .r2.dev
// public URL doesn't send any, and the app's R2 API token isn't scoped to
// change the bucket's CORS policy (confirmed: PutBucketCors → AccessDenied)
// — so this proxies through our own origin instead, where no CORS is
// needed at all rather than depending on an external dashboard setting.

import { NextRequest, NextResponse } from "next/server";
import { getPublicUrl } from "@/lib/r2";

// Only ever serves cosmetics/ assets — this is a public asset proxy (no
// auth needed, same as the R2 URLs it replaces are already public), but
// still shouldn't become an open fetch-anything-in-the-bucket relay.
const KEY_RE = /^cosmetics\/[A-Za-z0-9_\-./]+$/;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const res = await fetch(getPublicUrl(key));
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
