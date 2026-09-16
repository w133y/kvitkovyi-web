import { prisma } from "@/lib/prisma";
import type { ProductCategory } from "@prisma/client";

export function getProductsByCategory(category: ProductCategory) {
  return prisma.product.findMany({
    where: { category, active: true },
    orderBy: { sortOrder: "asc" },
  });
}
