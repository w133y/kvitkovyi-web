import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Донат - Квітковий",
};

export default function ShopPage() {
  return (
    <div className="shop-categories">
      <Link href="/shop/sponsorship" className="shop-category-card">
        <i className="fa-solid fa-crown"></i>
        <h2>Спонсорство</h2>
        <p>Привілеї та можливості, що підтримують розвиток серверу.</p>
      </Link>
      <div className="shop-category-card shop-category-card-disabled">
        <span className="shop-category-badge">Coming soon</span>
        <i className="fa-solid fa-wand-magic-sparkles"></i>
        <h2>Косметика</h2>
        <p>Декорації та косметичні прикраси для твого персонажа.</p>
      </div>
    </div>
  );
}
