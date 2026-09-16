"use server";

import { auth } from "@/lib/auth";
import { listAdminLogs, clearAdminLogs } from "@/lib/admin-log";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
}

export async function getAdminLogs() {
  await requireAdmin();
  return listAdminLogs();
}

export async function clearAdminLogsAction(): Promise<void> {
  await requireAdmin();
  await clearAdminLogs();
}
