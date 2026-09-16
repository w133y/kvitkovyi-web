"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CheckoutItem = { productId: string; quantity: number };

export type CheckoutResult = { orderId: string } | { error: string };

// No payment provider yet — every order is created PENDING for later manual
// (and eventually automatic) fulfillment. See prisma/schema.prisma OrderStatus.
export async function checkout(
  items: CheckoutItem[],
  minecraftNickname: string,
  note?: string
): Promise<CheckoutResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Потрібно увійти через Discord" };
  }
  if (items.length === 0) {
    return { error: "Кошик порожній" };
  }
  if (!minecraftNickname.trim()) {
    return { error: "Вкажіть свій нікнейм у грі" };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, active: true },
  });

  const orderItemsData = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product || item.quantity <= 0) {
      return { error: "Один із товарів у кошику більше недоступний" };
    }
    orderItemsData.push({
      productId: product.id,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
    });
  }

  const totalCents = orderItemsData.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  const order = await prisma.order.create({
    data: {
      userId: session.user.id,
      totalCents,
      minecraftNickname: minecraftNickname.trim(),
      note: note?.trim() || null,
      items: { create: orderItemsData },
    },
  });

  return { orderId: order.id };
}
