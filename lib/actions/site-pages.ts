"use server";

import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisabledPages, SITE_SETTINGS_TAG } from "@/lib/page-access";
import { SERVER_ADDRESS_RE, SERVER_VERSION_RE, isSitePageKey, type SitePageKey } from "@/lib/site-pages";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
}

export async function listDisabledPages(): Promise<SitePageKey[]> {
  await requireAdmin();
  return getDisabledPages();
}

// Switches a site section on/off for regular visitors (see lib/page-access.ts).
export async function setSitePageEnabled(key: string, enabled: boolean): Promise<SitePageKey[]> {
  await requireAdmin();
  if (!isSitePageKey(key)) throw new Error("Невідома вкладка");

  // Straight from the DB, not getDisabledPages()'s cache: a read-modify-write
  // must never build on a stale copy.
  const row = await prisma.siteSettings.findUnique({ where: { id: "default" }, select: { disabledPages: true } });
  const current = (row?.disabledPages ?? []) as SitePageKey[];
  const next = enabled ? current.filter((k) => k !== key) : [...new Set([...current, key])];
  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: { disabledPages: next },
    create: { id: "default", disabledPages: next },
  });
  updateTag(SITE_SETTINGS_TAG);
  // Nav links and the /shop cards change on every page.
  revalidatePath("/", "layout");
  return next;
}

export async function setServerInfo(
  rawIp: string,
  rawVersion: string
): Promise<{ ok: true; serverIp: string; serverVersion: string } | { error: string }> {
  await requireAdmin();
  const serverIp = rawIp.trim().toLowerCase();
  if (!SERVER_ADDRESS_RE.test(serverIp)) {
    return { error: "Вкажіть адресу на кшталт mc.example.com або 1.2.3.4:25565" };
  }
  const serverVersion = rawVersion.trim().replace(/\s+/g, " ");
  if (!SERVER_VERSION_RE.test(serverVersion)) {
    return { error: "Версія — на кшталт 26.2 або 1.21+" };
  }
  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: { serverIp, serverVersion },
    create: { id: "default", serverIp, serverVersion },
  });
  updateTag(SITE_SETTINGS_TAG);
  revalidatePath("/join");
  revalidatePath("/admin");
  return { ok: true, serverIp, serverVersion };
}
