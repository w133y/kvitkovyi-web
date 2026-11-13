import { auth } from "@/lib/auth";

// Admin panel tabs (app/(site)/admin/page.tsx) some site admins are kept out
// of, by Discord id: "season" — Сезон і сервер (season change, server
// address, site sections); "players" — Гравці (privileges, achievements,
// bios, account deletion).
export type AdminTab = "season" | "players";

const RESTRICTED_ADMIN_TABS: Record<string, AdminTab[]> = {
  "1375438624929349735": ["season", "players"], // mrailak (mars)
};

export function canUseAdminTab(discordId: string | null | undefined, tab: AdminTab): boolean {
  return !!discordId && !RESTRICTED_ADMIN_TABS[discordId]?.includes(tab);
}

// For the server actions behind a tab: hiding the tab isn't enough, they can
// be called directly.
export async function requireAdminTab(tab: AdminTab) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !canUseAdminTab(session.user.discordId, tab)) {
    throw new Error("Доступ заборонено");
  }
  return session;
}
