// Builds the same-origin proxy URL for a cosmetic's model/texture — see
// app/api/cosmetics-asset/route.ts for why this exists instead of the raw
// R2 public URL (CORS; WebGL texture fetches need it, plain <img> doesn't).
export function cosmeticAssetUrl(key: string): string {
  return `/api/cosmetics-asset?key=${encodeURIComponent(key)}`;
}
