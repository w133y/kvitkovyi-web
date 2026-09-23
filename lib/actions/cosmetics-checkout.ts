"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDiscordLink, getFlowerBalance } from "@/lib/mc-db";
import { sendServerCommand } from "@/lib/kinetic";
import { grantCosmeticInGame } from "@/lib/cosmetics/grant";
import { logError } from "@/lib/admin-log";
import { revalidatePath } from "next/cache";

export type CheckoutCosmeticItem = { cosmeticItemId: string; quantity: number };
export type CheckoutCosmeticsResult = { orderId: string } | { error: string };

// Settles a cosmetics cart in квітки and delivers each item in-game.
// idempotencyKey is generated once per checkout attempt on the client
// (crypto.randomUUID(), see CosmeticsCatalog.tsx) and cleared only on
// success/failure — a duplicate rapid double-click resubmits the same key,
// which the CosmeticOrder.idempotencyKey unique constraint turns into a
// no-op (this function just returns the already-created order) instead of
// a second charge.
//
// Order sequencing matters here: the CosmeticOrder row is created BEFORE
// the currency is actually deducted, specifically so the idempotency check
// above can catch a double-click before it ever reaches
// sendServerCommand("currency take ..."). CosmeticGrant rows are only
// created AFTER that deduction succeeds — if it throws, the just-created
// order is deleted and nothing is left pending, so a failed charge can
// never result in a "PENDING" grant the sweep would later deliver for free.
export async function checkoutCosmetics(
  items: CheckoutCosmeticItem[],
  idempotencyKey: string
): Promise<CheckoutCosmeticsResult> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти через Discord" };
  if (!session.user.discordId) return { error: "Discord-акаунт не прив'язано" };
  if (items.length === 0) return { error: "Кошик порожній" };
  if (!/^[0-9a-f-]{16,64}$/i.test(idempotencyKey)) return { error: "Некоректний запит" };

  const existing = await prisma.cosmeticOrder.findUnique({ where: { idempotencyKey } });
  if (existing) return { orderId: existing.id };

  const link = await getDiscordLink(session.user.discordId);
  if (!link) return { error: "До вашого Discord-акаунту не прив'язано нікнейм на сервері" };

  const cosmeticItems = await prisma.cosmeticItem.findMany({
    where: {
      id: { in: items.map((i) => i.cosmeticItemId) },
      status: "PUBLISHED",
      product: { active: true },
    },
  });

  const lines: { item: (typeof cosmeticItems)[number]; quantity: number }[] = [];
  for (const requested of items) {
    const item = cosmeticItems.find((c) => c.id === requested.cosmeticItemId);
    if (!item) return { error: "Один із товарів у кошику більше недоступний" };
    // A wearable (HAT/BACKPACK/BALLOON) grants a boolean permission — more
    // than 1 makes no sense and would just charge extra for nothing.
    const quantity = item.type === "FURNITURE" ? Math.max(1, Math.floor(requested.quantity)) : 1;
    lines.push({ item, quantity });
  }

  const totalFlowers = lines.reduce((sum, l) => sum + l.item.priceFlowers * l.quantity, 0);

  const balance = await getFlowerBalance(link.nickname);
  if (balance === null) return { error: "Не вдалося перевірити баланс квіток" };
  if (balance < totalFlowers) return { error: "Недостатньо квіток" };

  let orderId: string;
  try {
    const order = await prisma.cosmeticOrder.create({
      data: { userId: session.user.id, nickname: link.nickname, totalFlowers, idempotencyKey },
    });
    orderId = order.id;
  } catch {
    // Lost a race against another request with the same key — that request
    // already has (or is about to have) the real order.
    const raced = await prisma.cosmeticOrder.findUnique({ where: { idempotencyKey } });
    if (raced) return { orderId: raced.id };
    return { error: "Не вдалося створити замовлення" };
  }

  try {
    await sendServerCommand(`currency take ${link.nickname} ${totalFlowers}`);
  } catch (err) {
    await logError("cosmetics-checkout: currency deduction failed", link.nickname, totalFlowers, err);
    await prisma.cosmeticOrder.delete({ where: { id: orderId } });
    return { error: "Не вдалося списати квітки. Спробуйте ще раз." };
  }

  await prisma.cosmeticGrant.createMany({
    data: lines.map((l) => ({ orderId, cosmeticItemId: l.item.id, quantity: l.quantity })),
  });

  // квітки are already spent at this point, so a failed delivery here isn't
  // terminal — the grant just stays PENDING (createMany's default) and
  // lib/cosmetics/sweep.ts retries it later, same as a DonatePrivilege
  // grant that missed an offline player. Only a successful delivery updates
  // anything here.
  const grants = await prisma.cosmeticGrant.findMany({ where: { orderId }, include: { cosmeticItem: true } });
  for (const grant of grants) {
    const delivered = await grantCosmeticInGame({
      nickname: link.nickname,
      type: grant.cosmeticItem.type,
      nexoItemId: grant.cosmeticItem.nexoItemId,
      hmcCosmeticId: grant.cosmeticItem.hmcCosmeticId,
      quantity: grant.quantity,
    });
    if (delivered) {
      await prisma.cosmeticGrant.update({ where: { id: grant.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    }
  }

  revalidatePath("/shop/cosmetics");
  return { orderId };
}
