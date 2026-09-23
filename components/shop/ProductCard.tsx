"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/lib/format";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  // Only ever null for a COSMETIC-category product, which this generic
  // card/cart never renders (see CosmeticsCatalog.tsx) — still typed as
  // nullable because Product.priceCents itself is (it's null for cosmetics,
  // priced in квітки instead), not because this component expects it.
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
};

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    if (product.priceCents == null) return;
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      imageUrl: product.imageUrl,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="product-card">
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
      )}
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      {product.priceCents != null && (
        <div className="price">{formatPrice(product.priceCents, product.currency)}</div>
      )}
      <button type="button" className="add-to-cart" onClick={handleAdd} disabled={added}>
        {added ? "Додано!" : "Додати в кошик"}
      </button>
    </div>
  );
}
