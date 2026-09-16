"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/lib/format";
import { checkout } from "@/lib/actions/checkout";

export default function CheckoutForm() {
  const { items, totalCents, clear } = useCart();
  const [nickname, setNickname] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (orderId) {
    return (
      <div className="checkout-summary">
        <h2>
          <b>Дякуємо!</b>
        </h2>
        <p>
          Замовлення <b>№{orderId}</b> прийнято та очікує підтвердження. Ми зв&apos;яжемося з вами
          в Discord щодо оплати та видачі.
        </p>
        <div className="buttons-container">
          <Link href="/" className="custom-button">
            На головну
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="empty-state">Кошик порожній.</div>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await checkout(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        nickname,
        note
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      clear();
      setOrderId(result.orderId);
    });
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <div className="checkout-summary">
        {items.map((item) => (
          <div className="row" key={item.productId}>
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatPrice(item.priceCents * item.quantity, item.currency)}</span>
          </div>
        ))}
        <div className="row total">
          <span>Разом</span>
          <span>{formatPrice(totalCents, items[0]?.currency ?? "UAH")}</span>
        </div>
      </div>

      <label>
        Нікнейм у грі
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Ваш нік на сервері"
          required
        />
      </label>

      <label>
        Коментар (необов&apos;язково)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="buttons-container">
        <button type="submit" className="custom-button" disabled={isPending}>
          <i className="fa-solid fa-check"></i>
          <span>{isPending ? "Оформлення..." : "Підтвердити замовлення"}</span>
        </button>
      </div>
    </form>
  );
}
