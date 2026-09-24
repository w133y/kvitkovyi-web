// Total time each player has been a sponsor (Флорист and Меценат combined,
// past and current, incl. admin grants) — the /leaderboard "Спонсорство"
// sort. Renewals create overlapping DonatePrivilege rows (a renewal stacks
// onto the remaining time), so the intervals are merged, not summed.

import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

// lowercased nickname -> whole days
export async function getSponsorDaysByNickname(): Promise<Map<string, number>> {
  const rows = await prisma.donatePrivilege.findMany({
    select: { nickname: true, createdAt: true, expiresAt: true, revokedAt: true },
    orderBy: { createdAt: "asc" },
  });

  const intervals = new Map<string, [number, number][]>();
  for (const r of rows) {
    const start = r.createdAt.getTime();
    // An admin revoking early ends the privilege at revokedAt; the expiry
    // sweep sets revokedAt after expiresAt, so min() is right either way.
    const end = Math.min(r.expiresAt.getTime(), r.revokedAt?.getTime() ?? Infinity);
    if (end <= start) continue;
    const key = r.nickname.toLowerCase();
    const list = intervals.get(key) ?? [];
    list.push([start, end]);
    intervals.set(key, list);
  }

  const days = new Map<string, number>();
  for (const [key, list] of intervals) {
    let total = 0;
    let [curStart, curEnd] = list[0];
    for (const [s, e] of list.slice(1)) {
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else {
        total += curEnd - curStart;
        [curStart, curEnd] = [s, e];
      }
    }
    total += curEnd - curStart;
    days.set(key, Math.round(total / DAY_MS));
  }
  return days;
}
