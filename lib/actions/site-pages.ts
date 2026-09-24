"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisabledPages } from "@/lib/page-access";
import { isSitePageKey, type SitePageKey } from "@/lib/site-pages";

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

  const current = await getDisabledPages();
  const next = enabled ? current.filter((k) => k !== key) : [...new Set([...current, key])];
  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: { disabledPages: next },
    create: { id: "default", disabledPages: next },
  });
  // Nav links and the /shop cards change on every page.
  revalidatePath("/", "layout");
  return next;
}
