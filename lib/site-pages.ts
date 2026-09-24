// Site sections an admin can switch off for regular visitors (/admin →
// "Вкладки сайту"). Client-safe: the header uses it to hide nav links.
export const SITE_PAGES = [
  { key: "join", label: "Приєднатися", path: "/join" },
  { key: "wiki", label: "Вікі", path: "/wiki" },
  { key: "map", label: "Мапа", path: "/map" },
  { key: "leaderboard", label: "Таблиця лідерів", path: "/leaderboard" },
  { key: "gallery", label: "Галерея", path: "/gallery" },
  { key: "archive", label: "Архів", path: "/archive" },
  { key: "sponsorship", label: "Спонсорство", path: "/shop/sponsorship" },
  { key: "cosmetics", label: "Косметика", path: "/shop/cosmetics" },
] as const;

export type SitePageKey = (typeof SITE_PAGES)[number]["key"];

// Minecraft server address editable in /admin: a hostname or IPv4, with an
// optional :port. Strict because it's shown on the site and in Discord DMs.
export const DEFAULT_SERVER_IP = "mc.kvitkovyi.pp.ua";
export const SERVER_ADDRESS_RE =
  /^(?=.{1,253}(?::\d{1,5})?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;

export const DEFAULT_SERVER_VERSION = "26.2";
// "26.2", "1.21+", "1.20.4 – 1.21" — digits, dots, +, dashes and spaces only.
export const SERVER_VERSION_RE = /^[0-9][0-9.+\-– ]{0,19}$/;

export function isSitePageKey(key: string): key is SitePageKey {
  return SITE_PAGES.some((p) => p.key === key);
}
