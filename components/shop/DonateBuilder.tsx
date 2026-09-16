"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkinViewer from "@/components/profile/SkinViewer";
import RecipientPicker from "@/components/shop/RecipientPicker";
import { createDonateOrder } from "@/lib/actions/donate-order";
import {
  MINECRAFT_SYMBOLS,
  MINECRAFT_COLORS,
  FLORIST_SYMBOL,
  FLORIST_COLOR_HEX,
} from "@/lib/minecraft-symbols";

type Tier = "florist" | "mecenat";

const FEATURES: { label: string; florist: boolean; mecenat: boolean }[] = [
  { label: "Значок біля ніку", florist: true, mecenat: true },
  { label: "Свій колір і символ значка", florist: false, mecenat: true },
  { label: "Команда /co i", florist: true, mecenat: true },
  { label: "Команда /co look up", florist: false, mecenat: true },
  { label: "Роль в Discord", florist: true, mecenat: true },
  { label: "Створення власних картинок", florist: false, mecenat: true },
];

function FeatureList({ tierKey }: { tierKey: "florist" | "mecenat" }) {
  return (
    <ul className="donate-tier-perks">
      {FEATURES.map((f) => (
        <li key={f.label} className={f[tierKey] ? "has" : "missing"}>
          <i className={f[tierKey] ? "fa-solid fa-check" : "fa-solid fa-xmark"}></i>
          {f.label}
        </li>
      ))}
    </ul>
  );
}

export default function DonateBuilder({
  nickname,
  skinUrl,
  capeUrl,
  slim,
}: {
  nickname: string;
  skinUrl: string;
  capeUrl: string | null;
  slim: boolean;
}) {
  const router = useRouter();
  const [tier, setTier] = useState<Tier | null>("mecenat");
  const [symbol, setSymbol] = useState(MINECRAFT_SYMBOLS[0].char);
  const [colorHex, setColorHex] = useState(MINECRAFT_COLORS[14].hex); // yellow default
  const [recipient, setRecipient] = useState(nickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSymbol = tier === "florist" ? FLORIST_SYMBOL : symbol;
  const previewColor = tier === "florist" ? FLORIST_COLOR_HEX : colorHex;
  const mecenatActive = tier === "mecenat";

  async function goToPayment() {
    if (!tier || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createDonateOrder({
      tier: tier === "mecenat" ? "MECENAT" : "FLORIST",
      iconSymbol: tier === "mecenat" ? symbol : undefined,
      iconColorHex: tier === "mecenat" ? colorHex : undefined,
      recipientNickname: recipient,
    });
    if ("error" in result) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    router.push(`/shop/sponsorship/payment?order=${result.orderId}`);
  }

  return (
    <div className="donate-builder">
      <div className="donate-col donate-col-tiers">
        <div className={`donate-tier-card ${tier === "florist" ? "selected" : ""}`}>
          <div className="donate-tier-icon" style={{ color: FLORIST_COLOR_HEX }}>
            {FLORIST_SYMBOL}
          </div>
          <h3>Флорист</h3>
          <div className="donate-tier-price">49 ₴ / міс</div>
          <FeatureList tierKey="florist" />
          <button
            type="button"
            className="donate-tier-toggle"
            onClick={() => setTier(tier === "florist" ? null : "florist")}
          >
            <i className={tier === "florist" ? "fa-solid fa-minus" : "fa-solid fa-plus"}></i>
            {tier === "florist" ? "Прибрати" : "Обрати"}
          </button>
        </div>

        <div className={`donate-tier-card ${tier === "mecenat" ? "selected" : ""}`}>
          <div className="donate-tier-icon" style={{ color: colorHex }}>
            {symbol}
          </div>
          <h3>Меценат</h3>
          <div className="donate-tier-price">99 ₴ / міс</div>
          <FeatureList tierKey="mecenat" />
          <button
            type="button"
            className="donate-tier-toggle"
            onClick={() => setTier(tier === "mecenat" ? null : "mecenat")}
          >
            <i className={tier === "mecenat" ? "fa-solid fa-minus" : "fa-solid fa-plus"}></i>
            {tier === "mecenat" ? "Прибрати" : "Обрати"}
          </button>
        </div>
      </div>

      <div className={`donate-col donate-col-symbol ${mecenatActive ? "" : "disabled"}`}>
        <h3>Символ</h3>
        <p className="donate-col-hint">
          {mecenatActive
            ? "Оберіть символ і колір — вони будуть відображатись поруч з вашим ніком."
            : "Доступно тільки для привілегії «Меценат»."}
        </p>

        <div className="donate-symbol-grid">
          {MINECRAFT_SYMBOLS.map((s) => (
            <button
              type="button"
              key={s.char}
              className={`donate-symbol-btn ${symbol === s.char ? "active" : ""}`}
              title={s.label}
              disabled={!mecenatActive}
              onClick={() => setSymbol(s.char)}
            >
              {s.char}
            </button>
          ))}
        </div>

        <h4>Колір</h4>
        <div className="donate-color-grid">
          {MINECRAFT_COLORS.map((c) => (
            <button
              type="button"
              key={c.code}
              className={`donate-color-btn ${colorHex === c.hex ? "active" : ""}`}
              title={c.label}
              style={{ background: c.hex }}
              disabled={!mecenatActive}
              onClick={() => setColorHex(c.hex)}
            />
          ))}
        </div>
      </div>

      <div className="donate-col donate-col-preview">
        <div className={`profile-nick-badge donate-nick-badge${tier ? "" : " no-icon"}`}>
          <span>{nickname}</span>
          {tier && (
            <span className="donate-icon-preview" style={{ color: previewColor }}>
              {previewSymbol}
            </span>
          )}
        </div>

        <div className="profile-skin-card donate-skin-card">
          <SkinViewer skinUrl={skinUrl} capeUrl={capeUrl} slim={slim} nickname={nickname} />
        </div>

        <Link href="/shop/sponsorship/info" className="donate-info-btn">
          <i className="fa-solid fa-circle-info"></i>
          <span>Інформація</span>
        </Link>

        <RecipientPicker myNickname={nickname} recipient={recipient} onChange={setRecipient} />

        <button type="button" className="donate-continue-btn" disabled={!tier || submitting} onClick={goToPayment}>
          {submitting ? "Зачекайте..." : "Продовжити"}
        </button>
        {error && <p className="donate-payment-error">{error}</p>}
      </div>
    </div>
  );
}
