// Server-side enforcement of the admin's per-section switches
// (lib/site-pages.ts). A disabled section is hidden and 404s for everyone
// except admins, who keep full access so they can check a section before
// switching it back on.

import { cache } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SitePageKey } from "@/lib/site-pages";

// Deduped per request (layout + page + header all ask).
export const getDisabledPages = cache(async (): Promise<SitePageKey[]> => {
  const row = await prisma.siteSettings.findUnique({ where: { id: "default" } });
  return (row?.disabledPages ?? []) as SitePageKey[];
});

// Sections the current visitor can't use — always empty for admins.
export const getHiddenPagesForViewer = cache(async (): Promise<SitePageKey[]> => {
  const [disabled, session] = await Promise.all([getDisabledPages(), auth()]);
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
