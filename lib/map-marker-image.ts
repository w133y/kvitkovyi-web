// Server-only: turns a player's custom marker logo (an uploaded file or an
// image link) into a validated, size-capped data: URI. Stored on the marker
// and embedded inside its map pin SVG (an <img>-loaded SVG can't fetch
// external images, but data: URIs inside it do render).

import { MARKER_IMAGE_MAX_BYTES } from "@/lib/map-markers";

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

const TOO_BIG = `Картинка завелика — максимум ${Math.round(MARKER_IMAGE_MAX_BYTES / 1024)} КБ`;

// Trust the bytes, never the claimed type/extension.
export function imageBytesToDataUri(bytes: Buffer): string | { error: string } {
  if (bytes.length > MARKER_IMAGE_MAX_BYTES) return { error: TOO_BIG };
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) return { error: "Підтримуються лише PNG, JPEG, GIF або WebP" };
  return `data:${sig.mime};base64,${bytes.toString("base64")}`;
}

export function uploadedDataUriToImage(dataUri: string): string | { error: string } {
  const match = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!match) return { error: "Не вдалося прочитати картинку" };
  return imageBytesToDataUri(Buffer.from(match[1], "base64"));
}

// ponytail: blocks IP-literal/localhost hosts and redirects, so a link can't
// point the server at internal addresses directly; a public hostname that
// resolves to a private IP (DNS rebinding) isn't covered — resolve and check
// the address first if this ever runs somewhere with a reachable intranet.
export async function fetchImageAsDataUri(rawUrl: string): Promise<string | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { error: "Некоректне посилання на картинку" };
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  ) {
    return { error: "Посилання має бути https-адресою сайту з картинкою" };
  }

  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
  } catch {
    return { error: "Не вдалося завантажити картинку за посиланням" };
  }
  if (!res.ok || !res.body) return { error: "Не вдалося завантажити картинку за посиланням" };
  if (Number(res.headers.get("content-length") ?? 0) > MARKER_IMAGE_MAX_BYTES) return { error: TOO_BIG };

  // Read with a hard cap rather than trusting content-length.
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MARKER_IMAGE_MAX_BYTES) {
      await reader.cancel();
      return { error: TOO_BIG };
    }
    chunks.push(Buffer.from(value));
  }
  return imageBytesToDataUri(Buffer.concat(chunks));
}
