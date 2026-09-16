// Server-side error log shown on /admin (see components/admin/AdminLog.tsx)
// — every lib/*.ts file that talks to an external service (Discord,
// Kinetic, Cloudinary, Donatello, the Minecraft MySQL DB) logs failures
// through here instead of a bare console.error, so an admin can actually
// see what's been failing without digging through Vercel's function logs.

import { prisma } from "@/lib/prisma";

export async function getAdminSettings() {
  return prisma.adminSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function setErrorLoggingEnabled(enabled: boolean): Promise<void> {
  await prisma.adminSettings.upsert({
    where: { id: "default" },
    update: { errorLoggingEnabled: enabled },
    create: { id: "default", errorLoggingEnabled: enabled },
  });
}

// Same "prefix: what failed" convention every console.error call already
// used before this existed — kept as one string rather than splitting into
// a separate context field, since the message alone is already meaningful.
// `extra` mirrors console.error's own variadic signature (a status code, a
// response body, a caught Error, any mix) — whatever the call site used to
// pass straight to console.error.
export async function logError(message: string, ...extra: unknown[]): Promise<void> {
  console.error(message, ...extra);
  try {
    const { errorLoggingEnabled } = await getAdminSettings();
    if (!errorLoggingEnabled) return;

    const errorArg = extra.find((e): e is Error => e instanceof Error);
    const detail =
      extra.length === 0
        ? null
        : errorArg
          ? (errorArg.stack ?? errorArg.message)
          : extra.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join(" ");
    await prisma.adminLogEntry.create({ data: { message, detail } });
  } catch (loggingErr) {
    // The DB write itself failing (e.g. the DB is what's down) must never
    // throw back into the caller — it already has its own real error to
    // handle, this is just best-effort visibility on top.
    console.error("admin-log: failed to persist log entry", loggingErr);
  }
}

const MAX_ENTRIES = 200;

// Called from the admin panel's own load, not on every write — keeps the
// hot error-logging path (which may itself be firing under duress, e.g. a
// flaky external API) from paying for an extra count+prune on every call.
export async function listAdminLogs() {
  const entries = await prisma.adminLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ENTRIES,
  });

  const excess = await prisma.adminLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_ENTRIES,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.adminLogEntry.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }

  return entries;
}

export async function clearAdminLogs(): Promise<void> {
  await prisma.adminLogEntry.deleteMany({});
}
