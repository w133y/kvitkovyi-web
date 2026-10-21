// Server-side enforcement of the admin's per-section switches
// (lib/site-pages.ts). A disabled section is hidden and 404s for everyone
// except admins, who keep full access so they can check a section before
// switching it back on.

import { cache } from "react";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SERVER_IP, DEFAULT_SERVER_VERSION, type SitePageKey } from "@/lib/site-pages";

export const SITE_SETTINGS_TAG = "site-settings";

// Read on every page (hidden sections, the server address) but only changed
// from the admin panel, which clears the tag (lib/actions/site-pages.ts) —
// so requests skip the DB instead of a round trip each. The hour is only a
// backstop for edits made straight in the DB. Also deduped per request.
// ponytail: unstable_cache is the pre-`use cache` API; switch once the app
// opts into cacheComponents.
const getSiteSettings = cache(
  unstable_cache(
    () =>
      prisma.siteSettings.findUnique({
        where: { id: "default" },
        select: { disabledPages: true, serverIp: true, serverVersion: true },
      }),
    ["site-settings"],
    { tags: [SITE_SETTINGS_TAG], revalidate: 3600 }
  )
);

export const getDisabledPages = cache(async (): Promise<SitePageKey[]> => {
  return ((await getSiteSettings())?.disabledPages ?? []) as SitePageKey[];
});

// Server address + game version for /join, its copy button and the Discord
// welcome DM.
export async function getServerInfo(): Promise<{ ip: string; version: string }> {
  const row = await getSiteSettings();
  return { ip: row?.serverIp ?? DEFAULT_SERVER_IP, version: row?.serverVersion ?? DEFAULT_SERVER_VERSION };
}

// Sections the current visitor can't use — always empty for admins.
export const getHiddenPagesForViewer = cache(async (): Promise<SitePageKey[]> => {
  const [disabled, session] = await Promise.all([getDisabledPages(), getSession()]);
  return session?.user?.role === "ADMIN" ? [] : disabled;
});

export async function isPageAvailable(key: SitePageKey): Promise<boolean> {
  return !(await getHiddenPagesForViewer()).includes(key);
}

// For section layouts: a disabled section doesn't exist for regular visitors,
// direct links included.
export async function assertPageAvailable(key: SitePageKey): Promise<void> {
  if (!(await isPageAvailable(key))) notFound();
}
