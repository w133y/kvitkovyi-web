import { prisma } from "@/lib/prisma";
import { sweepExpiredDonatePrivileges } from "@/lib/donate-privilege-grants";

// A player could in theory have both an active FLORIST and MECENAT row
// (e.g. they upgraded without the old one being revoked) — MECENAT is a
// strict superset, so it wins when both are active.
//
// There's no cron for the expiry sweep (see donate-privilege-grants.ts), so
// a profile view is also where that player's own expired privileges
// actually get revoked in-game — cheap when nothing's expired (one extra
// query, no Kinetic calls), so fine to run on every page load.
export async function getActivePrivilege(nickname: string) {
  await sweepExpiredDonatePrivileges(nickname);

  const rows = await prisma.donatePrivilege.findMany({
    where: { nickname, expiresAt: { gt: new Date() } },
  });
  if (rows.length === 0) return null;
  return rows.find((r) => r.tier === "MECENAT") ?? rows[0];
}
