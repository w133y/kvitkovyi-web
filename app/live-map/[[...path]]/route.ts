// Same-origin proxy for the BlueMap live map server (plain HTTP), so it can
// be iframed from an HTTPS page without triggering mixed-content blocking.
// Implemented as a route handler (not a next.config rewrite) so the HTML
// response can be patched with <base href="/live-map/"> — without that,
// BlueMap's own relative asset paths ("./assets/...") resolve incorrectly
// whenever the browser ends up on the no-trailing-slash "/live-map" URL
// (which Next's own routing normalizes to, redirecting away "/live-map/").
const TARGET = "http://REDACTED:25585";

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

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = (await upstream.text()).replace("<head>", '<head><base href="/live-map/">');
    return new Response(html, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
