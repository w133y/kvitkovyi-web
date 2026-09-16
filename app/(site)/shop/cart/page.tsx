"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/lib/format";

export default function CartPage() {
  const { items, setQuantity, removeItem, totalCents } = useCart();

  if (items.length === 0) {
    return (
      <div className="box2">
        <div className="lbheader">
          <h2>
            <b>Кошик</b>
          </h2>
        </div>
        <div className="empty-state">
          Кошик порожній. Перегляньте{" "}
          <Link href="/shop" style={{ color: "#ffd900e0" }}>
            донат
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="box2">
      <div className="lbheader">
        <h2>
          <b>Кошик</b>
        </h2>
      </div>

      <div className="cart-list">
        {items.map((item) => (
          <div className="cart-row" key={item.productId}>
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} />
            )}
            <div className="info">
              <div className="name">{item.name}</div>
              <div className="unit-price">{formatPrice(item.priceCents, item.currency)} / шт</div>
            </div>
            <div className="qty-controls">
              <button type="button" onClick={() => setQuantity(item.productId, item.quantity - 1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => setQuantity(item.productId, item.quantity + 1)}>
                +
              </button>
            </div>
            <div className="line-total">{formatPrice(item.priceCents * item.quantity, item.currency)}</div>
            <button type="button" className="remove-btn" onClick={() => removeItem(item.productId)} aria-label="Видалити">
              <i className="fas fa-trash"></i>
            </button>
          </div>
        ))}
      </div>

      <div className="cart-total">
        <span>Разом:</span>
        <span>{formatPrice(totalCents, items[0]?.currency ?? "UAH")}</span>
      </div>

      <div className="buttons-container">
        <Link href="/shop/checkout" className="custom-button">
          <i className="fa-solid fa-check"></i>
          <span>Оформити замовлення</span>
        </Link>
      </div>
    </div>
  );
}
