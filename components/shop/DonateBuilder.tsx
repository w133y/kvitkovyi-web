"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SkinViewer from "@/components/profile/SkinViewer";
import RecipientPicker from "@/components/shop/RecipientPicker";
import { createDonateOrder, getRecipientSkin } from "@/lib/actions/donate-order";
import {
  MINECRAFT_SYMBOLS,
  MINECRAFT_COLORS,
  FLORIST_SYMBOL,
  FLORIST_COLOR_HEX,
  HEX_COLOR_RE,
  hueToHex,
  hexToHue,
} from "@/lib/minecraft-symbols";
import {
  TIER_PRICE_UAH,
  MIN_DONATE_MONTHS,
  MAX_DONATE_MONTHS,
  durationDiscount,
  calculateDonateAmount,
} from "@/lib/donate-pricing";

type Tier = "florist" | "mecenat";

const FEATURES: { label: string; florist: boolean; mecenat: boolean }[] = [
  { label: "Значок біля ніку", florist: true, mecenat: true },
  { label: "Свій колір і символ значка", florist: false, mecenat: true },
  { label: "Команда /co i", florist: true, mecenat: true },
  { label: "Команда /hat", florist: true, mecenat: true },
  { label: "Команда /co look up", florist: false, mecenat: true },
  { label: "Роль в Discord", florist: true, mecenat: true },
  { label: "Створення власних картинок", florist: false, mecenat: true },
  { label: "Кастомні платівки", florist: false, mecenat: true },
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
  // The privilege-expiry reminder DM links back here with the player's own
  // already-chosen tier/symbol/color (see lib/donate-privilege-reminders.ts)
  // so renewing doesn't mean re-picking everything from scratch — read once
  // on mount, not reactive to later URL changes.
  const searchParams = useSearchParams();
  const [tier, setTier] = useState<Tier | null>(searchParams.get("tier") === "florist" ? "florist" : "mecenat");
  const [symbol, setSymbol] = useState(searchParams.get("symbol") || MINECRAFT_SYMBOLS[0].char);
  const [colorHex, setColorHex] = useState(searchParams.get("color") || MINECRAFT_COLORS[14].hex); // yellow default
  // Free-typed text mirrors colorHex but can briefly hold an invalid/partial
  // value while the user is typing/pasting — only committed to colorHex
  // once it matches HEX_COLOR_RE, so the preview/suffix never show garbage.
  const [hexInput, setHexInput] = useState(colorHex);
  const [months, setMonths] = useState(1);
  const [recipient, setRecipient] = useState(nickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Own skin is already known from props (the page fetched it server-side)
  // — only a gifted recipient needs its own fetch, on demand, since there's
  // no reason to look up every player someone merely searches for.
  const [previewSkin, setPreviewSkin] = useState({ skinUrl, capeUrl, slim });
  const [skinLoading, setSkinLoading] = useState(false);

  useEffect(() => {
    if (recipient.toLowerCase() === nickname.toLowerCase()) {
      setPreviewSkin({ skinUrl, capeUrl, slim });
      return;
    }
    let cancelled = false;
    setSkinLoading(true);
    getRecipientSkin(recipient).then((result) => {
      if (cancelled) return;
      setSkinLoading(false);
      if (!("error" in result)) setPreviewSkin(result);
    });
    return () => {
      cancelled = true;
    };
  }, [recipient, nickname, skinUrl, capeUrl, slim]);

  function handleHueChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = hueToHex(Number(e.target.value));
    setColorHex(hex);
    setHexInput(hex);
  }

  function handleHexInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setHexInput(raw);
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    if (HEX_COLOR_RE.test(normalized)) setColorHex(normalized.toUpperCase());
  }

  const previewSymbol = tier === "florist" ? FLORIST_SYMBOL : symbol;
  const previewColor = tier === "florist" ? FLORIST_COLOR_HEX : colorHex;
  const mecenatActive = tier === "mecenat";

  const tierKey = tier === "mecenat" ? "MECENAT" : "FLORIST";
  const totalAmount = tier ? calculateDonateAmount(tierKey, months) : 0;
  const discount = durationDiscount(months);

  async function goToPayment() {
    if (!tier || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createDonateOrder({
      tier: tierKey,
      iconSymbol: tier === "mecenat" ? symbol : undefined,
      iconColorHex: tier === "mecenat" ? colorHex : undefined,
      months,
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
        <button
          type="button"
          className={`donate-tier-card ${tier === "florist" ? "selected" : ""}`}
          onClick={() => setTier(tier === "florist" ? null : "florist")}
        >
          <div className="donate-tier-icon" style={{ color: FLORIST_COLOR_HEX }}>
            {FLORIST_SYMBOL}
          </div>
          <h3>Флорист</h3>
          <div className="donate-tier-price">{TIER_PRICE_UAH.FLORIST} ₴ / міс</div>
          <FeatureList tierKey="florist" />
        </button>

        <button
          type="button"
          className={`donate-tier-card ${tier === "mecenat" ? "selected" : ""}`}
          onClick={() => setTier(tier === "mecenat" ? null : "mecenat")}
        >
          <div className="donate-tier-icon" style={{ color: colorHex }}>
            {symbol}
          </div>
          <h3>Меценат</h3>
          <div className="donate-tier-price">{TIER_PRICE_UAH.MECENAT} ₴ / міс</div>
          <FeatureList tierKey="mecenat" />
        </button>
      </div>

      <div className={`donate-col donate-col-symbol ${mecenatActive ? "" : "disabled"}`}>
        <h3>Значок</h3>
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
        <div className="donate-color-picker">
          <div className="donate-color-slider-row">
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(hexToHue(colorHex))}
              disabled={!mecenatActive}
              onChange={handleHueChange}
              className="donate-color-slider"
            />
            <input
              type="text"
              className="donate-color-hex-input"
              value={hexInput}
              disabled={!mecenatActive}
              maxLength={7}
              onChange={handleHexInputChange}
            />
          </div>
        </div>
      </div>

      <div className="donate-col donate-col-preview">
        <div className={`profile-nick-badge donate-nick-badge${tier ? "" : " no-icon"}`}>
          <span>{recipient}</span>
          {tier && (
            <span className="donate-icon-preview" style={{ color: previewColor }}>
              {previewSymbol}
            </span>
          )}
        </div>

        <div className={`profile-skin-card donate-skin-card${skinLoading ? " donate-skin-card-loading" : ""}`}>
          <SkinViewer
            skinUrl={previewSkin.skinUrl}
            capeUrl={previewSkin.capeUrl}
            slim={previewSkin.slim}
            nickname={recipient}
            showControls={false}
          />
        </div>

        <Link href="/shop/sponsorship/info" className="donate-info-btn">
          <i className="fa-solid fa-circle-info"></i>
          <span>Інформація</span>
        </Link>

        <RecipientPicker myNickname={nickname} recipient={recipient} onChange={setRecipient} />

        <div className="donate-duration">
          <h4>Тривалість</h4>
          <div className="donate-duration-grid">
            {Array.from({ length: MAX_DONATE_MONTHS }, (_, i) => i + MIN_DONATE_MONTHS).map((m) => {
              const monthDiscount = durationDiscount(m);
              return (
                <button
                  type="button"
                  key={m}
                  className={`donate-duration-btn ${months === m ? "active" : ""}`}
                  disabled={!tier}
                  onClick={() => setMonths(m)}
                >
                  {m} міс
                  {monthDiscount > 0 && (
                    <span className="donate-duration-badge">-{Math.round(monthDiscount * 100)}%</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="donate-duration-total">
            Разом: <b>{tier ? `${totalAmount} ₴` : "—"}</b>
            {tier && discount > 0 && <span className="donate-duration-savings"> (знижка {Math.round(discount * 100)}%)</span>}
          </div>
        </div>

        <button type="button" className="donate-continue-btn" disabled={!tier || submitting} onClick={goToPayment}>
          {submitting ? "Зачекайте..." : "Продовжити"}
        </button>
        {error && <p className="donate-payment-error">{error}</p>}
      </div>
    </div>
  );
}
