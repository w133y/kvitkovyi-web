import CartBadge from "@/components/shop/CartBadge";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="shop-cart-shortcut">
        <CartBadge />
      </div>
      {children}
    </>
  );
}
