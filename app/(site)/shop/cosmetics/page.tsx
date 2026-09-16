import type { Metadata } from "next";
import ProductGrid from "@/components/shop/ProductGrid";
import { getProductsByCategory } from "@/lib/actions/products";

export const metadata: Metadata = {
  title: "Косметика - Квітковий",
};

export const revalidate = 60;

export default async function CosmeticsPage() {
  const products = await getProductsByCategory("COSMETIC");

  return (
    <div className="box2">
      <div className="lbheader">
        <h2>
          <b>Косметика</b>
        </h2>
        <p>Декорації та косметичні прикраси для твого персонажа.</p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
