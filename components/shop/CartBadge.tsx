"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";

export default function CartBadge() {
  const { itemCount } = useCart();
  const pathname = usePathname();

  // Neither the /shop category chooser (titled "Донат") nor sponsorship
  // (payment is external, via Donatello) go through the cart/checkout flow —
  // showing a cart shortcut there just implies a flow that doesn't exist.
  if (pathname === "/shop" || pathname.startsWith("/shop/sponsorship")) return null;

  return (
    <Link href="/shop/cart" className="cart-badge" aria-label="Кошик">
      <i className="fa-solid fa-cart-shopping"></i>
      {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
    </Link>
  );
}
