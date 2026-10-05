// Builds the same-origin proxy URL for a cosmetic's model/texture — see
// app/api/cosmetics-asset/route.ts for why this exists instead of the raw
// R2 public URL (CORS; WebGL texture fetches need it, plain <img> doesn't).
export function cosmeticAssetUrl(key: string): string {
  return `/api/cosmetics-asset?key=${encodeURIComponent(key)}`;
}

// Multi-texture models (lib/cosmetics/nexo-pack.ts): the stored model JSON
// points each texture variable at "kvitkovyi:tex<n>", and texture n lives
// next to the item's textureKey — n = 0 is textureKey itself, n ≥ 1 is
// "…/texture_<n>.png", each with an optional "<png>.mcmeta" (animation).
// Any other ref (older single-texture uploads) means texture 0.
export const TEXTURE_MARKER_RE = /^kvitkovyi:tex(\d+)$/;

export function textureIndex(ref: string): number {
  const m = ref.match(TEXTURE_MARKER_RE);
  return m ? Number(m[1]) : 0;
}

// Works on an R2 key and on its cosmeticAssetUrl alike — both end in ".png".
export function nthTexture(textureKeyOrUrl: string, n: number): string {
  return n === 0 ? textureKeyOrUrl : textureKeyOrUrl.replace(/\.png$/, `_${n}.png`);
}
