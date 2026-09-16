"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/lib/format";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
};

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
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
      <div className="price">{formatPrice(product.priceCents, product.currency)}</div>
      <button type="button" className="add-to-cart" onClick={handleAdd} disabled={added}>
        {added ? "Додано!" : "Додати в кошик"}
      </button>
    </div>
  );
}
