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

export function isSitePageKey(key: string): key is SitePageKey {
  return SITE_PAGES.some((p) => p.key === key);
}
