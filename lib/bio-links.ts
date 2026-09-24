// Player bios can't contain links — checked in the profile editor (instant
// feedback) and again in lib/actions/profile.ts updateProfile (the actual
// guard). Client-safe.
//
// Catches explicit URLs, "www.", Discord invites, and bare "name.tld"
// domains for common TLDs (letters-only TLDs, so "1.21" or "т.д." pass).
// ponytail: deliberately spaced-out tricks ("example . com") get through —
// admins can clear a bio from /admin.
const LINK_RE =
  /(https?:\/\/|www\.|discord(?:app)?\.(?:gg|com)\/|\b[a-z0-9-]+\.(?:com|net|org|ua|ru|gg|io|me|tv|xyz|site|online|shop|link|app|dev|co|info|store|club|fun|top|su|by|kz|pl|de|eu|uk|us)\b)/i;

export const BIO_LINK_ERROR = "У описі не можна вказувати посилання";

export function bioContainsLink(text: string): boolean {
  return LINK_RE.test(text);
}
