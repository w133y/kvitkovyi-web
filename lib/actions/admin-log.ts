"use server";

import { auth } from "@/lib/auth";
import { listAdminLogs, clearAdminLogs, getAdminSettings, setErrorLoggingEnabled } from "@/lib/admin-log";

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

export async function getErrorLoggingEnabled(): Promise<boolean> {
  await requireAdmin();
  const settings = await getAdminSettings();
  return settings.errorLoggingEnabled;
}

export async function setErrorLoggingEnabledAction(enabled: boolean): Promise<void> {
  await requireAdmin();
  await setErrorLoggingEnabled(enabled);
}
