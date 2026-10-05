// Retries any CosmeticGrant still PENDING — the player was offline at
// checkout time, or a transient Kinetic/console error hit — same
// opportunistic-sweep tradeoff as sweepExpiredDonatePrivileges in
// lib/donate-privilege-grants.ts, but run from the frequent
// /api/cron/welcome ping so offline buyers get their item soon after
// joining. квітки are already charged by the
// time a grant reaches PENDING (see lib/actions/cosmetics-checkout.ts), so
// this never re-charges — it only retries the in-game side.

import { prisma } from "@/lib/prisma";
import { grantCosmeticInGame } from "@/lib/cosmetics/grant";
import { logError } from "@/lib/admin-log";

export async function sweepUndeliveredCosmeticGrants(): Promise<void> {
  const pending = await prisma.cosmeticGrant.findMany({
    where: { status: "PENDING" },
    include: { order: true, cosmeticItem: true },
  });

  for (const grant of pending) {
    try {
      const delivered = await grantCosmeticInGame({
        nickname: grant.order.nickname,
        type: grant.cosmeticItem.type,
        nexoItemId: grant.cosmeticItem.nexoItemId,
        hmcCosmeticId: grant.cosmeticItem.hmcCosmeticId,
        quantity: grant.quantity,
      });
      if (delivered) {
        await prisma.cosmeticGrant.update({
          where: { id: grant.id },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
      }
    } catch (err) {
      await logError("cosmetics/sweep: retry failed", grant.id, err);
    }
  }
}
