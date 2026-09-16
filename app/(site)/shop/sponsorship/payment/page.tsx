import type { Metadata } from "next";
import Link from "next/link";
import { getDonateOrder } from "@/lib/actions/donate-order";
import { DONATELLO_PAGE_URL } from "@/lib/donatello";
import { FLORIST_SYMBOL, FLORIST_COLOR_HEX } from "@/lib/minecraft-symbols";
import PaymentStatusPoller from "@/components/shop/PaymentStatusPoller";
import DonateCodeCopy from "@/components/shop/DonateCodeCopy";

export const metadata: Metadata = {
  title: "Оплата - Квітковий",
};

const TIER_LABEL = { FLORIST: "Флорист", MECENAT: "Меценат" } as const;

export default async function DonatePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  const order = orderId ? await getDonateOrder(orderId) : null;

  if (!order) {
    return (
      <div className="donate-page">
        <div className="donate-header">
          <h2>
            <b>Оплата</b>
          </h2>
          <p>Спершу оберіть привілегію.</p>
        </div>
        <div className="donate-signin-prompt">
          <Link
            href="/shop/sponsorship"
            className="donate-continue-btn"
            style={{ width: "auto", padding: "14px 30px" }}
          >
            До вибору привілегії
          </Link>
        </div>
      </div>
    );
  }

  const icon = order.tier === "MECENAT" ? order.iconSymbol ?? FLORIST_SYMBOL : FLORIST_SYMBOL;
  const iconColor = order.tier === "MECENAT" ? order.iconColorHex ?? FLORIST_COLOR_HEX : FLORIST_COLOR_HEX;
  const isGift = order.buyerNickname.toLowerCase() !== order.nickname.toLowerCase();
  const expired = order.status === "EXPIRED";

  return (
    <div className="donate-page">
      <div className="donate-header">
        <h2>
          <b>Оплата</b>
        </h2>
        <p>
          {expired
            ? "Час на оплату цього замовлення вже сплив."
            : "Задонатьте суму нижче на Donatello, вказавши код у повідомленні — привілей увімкнеться автоматично."}
        </p>
      </div>

      <div className="donate-signin-prompt">
        <div className="donate-tier-card selected" style={{ maxWidth: 320, width: "100%" }}>
          <div className="donate-tier-icon" style={{ color: iconColor }}>
            {icon}
          </div>
          <h3>{TIER_LABEL[order.tier]}</h3>
          <div className="donate-tier-price">{order.amountUah} ₴ / міс</div>
          {isGift && (
            <p className="donate-payment-recipient">
              Отримувач: <b>{order.nickname}</b>
            </p>
          )}
        </div>

        {!expired && (
          <DonateCodeCopy code={order.code} amountUah={order.amountUah} donatelloUrl={DONATELLO_PAGE_URL} />
        )}

        <PaymentStatusPoller
          orderId={order.id}
          initialStatus={order.status}
          nickname={order.nickname}
          createdAt={order.createdAt.toISOString()}
        />

        {!expired && (
          <Link
            href="/shop/sponsorship"
            className="donate-continue-btn"
            style={{ width: "auto", padding: "10px 24px", background: "rgba(255, 255, 255, 0.08)" }}
          >
            Назад
          </Link>
        )}
      </div>
    </div>
  );
}
