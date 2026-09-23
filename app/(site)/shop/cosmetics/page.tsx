import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import CosmeticsCatalog from "@/components/shop/CosmeticsCatalog";
import { listPublishedCosmeticsForShop, getMyFlowerBalance, getMyOwnedCosmeticIds } from "@/lib/actions/cosmetics-shop";

export const metadata: Metadata = {
  title: "Косметика - Квітковий",
};

export default async function CosmeticsPage() {
  const session = await auth();
  const [items, balance, ownedIds] = await Promise.all([
    listPublishedCosmeticsForShop(),
    getMyFlowerBalance(),
    getMyOwnedCosmeticIds(),
  ]);

  return (
    <div className="box2">
      <div className="lbheader">
        <h2>
          <b>Косметика</b>
        </h2>
        <p>Декорації та косметичні прикраси для твого персонажа — за квітки.</p>
      </div>
      <CosmeticsCatalog items={items} initialBalance={balance} ownedIds={ownedIds} signedIn={!!session?.user} />
    </div>
  );
}
