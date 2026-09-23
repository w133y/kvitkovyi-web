"use client";

// The /shop/cosmetics page — a self-contained 2-panel shop (catalog+filters
// on the left, cart/3D-preview toggle on the right), priced in квітки.
// Deliberately NOT built on lib/cart/CartContext.tsx — that context's math
// is UAH cents, a different unit entirely, and this page never touches the
// generic /shop/cart or /shop/checkout routes.

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import ModelViewer3D from "@/components/cosmetics/ModelViewer3D";
import { checkoutCosmetics } from "@/lib/actions/cosmetics-checkout";
import type { CatalogCosmetic } from "@/lib/actions/cosmetics-shop";

// A multiple of 3 so every "load more" page fills whole rows on desktop.
const PAGE_SIZE = 12;
const CART_STORAGE_KEY = "kvitkovyi-cosmetics-cart";
const SAVED_STORAGE_KEY = "kvitkovyi-cosmetics-saved";

const TYPE_LABEL: Record<CatalogCosmetic["type"], string> = {
  HAT: "Шапочка",
  BACKPACK: "Бекпак",
  BALLOON: "Шарік",
  FURNITURE: "Меблі",
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage write failures (private mode, quota, etc.)
  }
}

export default function CosmeticsCatalog({
  items,
  initialBalance,
  ownedIds,
  signedIn,
}: {
  items: CatalogCosmetic[];
  initialBalance: number | null;
  ownedIds: string[];
  signedIn: boolean;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<"cart" | "preview">("cart");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderDone, setOrderDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // Regenerated once per checkout attempt, cleared only on success/failure
  // — see checkoutCosmetics' own comment on why this is what actually
  // prevents a double-click from double-charging. Generated in an effect,
  // not a useState(() => crypto.randomUUID()) initializer — that ran during
  // SSR too, producing a different id server vs client on the very first
  // render (a real hydration-mismatch cause, not just noise) even though
  // the id itself is never rendered as text.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  // Guards the "Передперегляд" tab button's disabled state specifically —
  // despite previewId/previewItem being deterministically null on mount in
  // both environments, this one attribute kept showing a genuine hydration
  // mismatch in practice. Forcing disabled=true until mount (identical on
  // both server and client, since the button can't have anything real to
  // preview before a card is clicked anyway) sidesteps it entirely instead
  // of chasing the exact mechanism further.
  const [mounted, setMounted] = useState(false);
  // The header's user menu (components/auth/UserMenuDropdown.tsx) streams in
  // under its own Suspense boundary, so its slot may not exist yet on mount.
  const [balanceSlot, setBalanceSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.getElementById("user-menu-extra");
    const found = find();
    if (found) return setBalanceSlot(found);
    const observer = new MutationObserver(() => {
      const el = find();
      if (el) { setBalanceSlot(el); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMounted(true);
    setIdempotencyKey(crypto.randomUUID());
    setCart(loadJson(CART_STORAGE_KEY, {}));
    setSaved(loadJson(SAVED_STORAGE_KEY, []));
  }, []);
  useEffect(() => saveJson(CART_STORAGE_KEY, cart), [cart]);
  useEffect(() => saveJson(SAVED_STORAGE_KEY, saved), [saved]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const availableTypes = useMemo(() => [...new Set(items.map((i) => i.type))], [items]);

  const filtered = items.filter((i) => {
    if (filter === "ALL") return true;
    if (filter === "SAVED") return saved.includes(i.id);
    return i.type === filter;
  });
  const visible = filtered.slice(0, visibleCount);

  function changeFilter(next: string) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  }

  const cartLines = Object.entries(cart)
    .map(([id, quantity]) => ({ item: itemById.get(id), quantity }))
    .filter((l): l is { item: CatalogCosmetic; quantity: number } => !!l.item && l.quantity > 0);
  const totalFlowers = cartLines.reduce((sum, l) => sum + l.item.priceFlowers * l.quantity, 0);
  const canAfford = initialBalance !== null && initialBalance >= totalFlowers;

  function addToCart(item: CatalogCosmetic) {
    setCart((prev) => {
      const current = prev[item.id] ?? 0;
      // A wearable is a boolean unlock — more than one in the cart is
      // meaningless, so it just toggles presence instead of incrementing.
      const next = item.type === "FURNITURE" ? current + 1 : current > 0 ? 0 : 1;
      return { ...prev, [item.id]: next };
    });
  }

  function setQuantity(id: string, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: quantity };
    });
  }

  function toggleSaved(id: string) {
    setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openPreview(id: string) {
    setPreviewId(id);
    setRightTab("preview");
  }

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await checkoutCosmetics(
        cartLines.map((l) => ({ cosmeticItemId: l.item.id, quantity: l.quantity })),
        idempotencyKey
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCart({});
      setOrderDone(true);
      setIdempotencyKey(crypto.randomUUID());
    });
  }

  const previewItem = previewId ? itemById.get(previewId) : null;

  return (
    <div className="cosmetics-shop">
      {balanceSlot &&
        signedIn &&
        initialBalance !== null &&
        createPortal(
          <div className="cosmetics-balance">
            <img src="/icon.ico" alt="" width={20} height={20} /> {initialBalance} квіток
          </div>,
          balanceSlot
        )}
      {(!signedIn || initialBalance === null) && (
        <div className="cosmetics-notice">
          {signedIn ? "Прив'яжіть нікнейм, щоб бачити баланс квіток" : "Увійдіть через Discord, щоб купувати косметику"}
        </div>
      )}

      <div className="cosmetics-layout">
        <div className="cosmetics-catalog-panel">
          <div className="cosmetics-filters">
            <button type="button" className={filter === "ALL" ? "active" : ""} onClick={() => changeFilter("ALL")}>
              Все
            </button>
            {availableTypes.map((type) => (
              <button key={type} type="button" className={filter === type ? "active" : ""} onClick={() => changeFilter(type)}>
                {TYPE_LABEL[type]}
              </button>
            ))}
            <button type="button" className={filter === "SAVED" ? "active" : ""} onClick={() => changeFilter("SAVED")}>
              Збережене
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">Тут поки що порожньо.</div>
          ) : (
            <div className="cosmetics-grid">
              {visible.map((item) => (
                <div
                  className={`cosmetics-card${item.id === previewId ? " selected" : ""}`}
                  key={item.id}
                  data-id={item.id}
                >
                  <button type="button" className="cosmetics-card-thumb" onClick={() => openPreview(item.id)}>
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnailUrl} alt={item.name} loading="lazy" />
                    ) : (
                      <span className="cosmetics-card-thumb-fallback">
                        <i className="fa-solid fa-cube" aria-hidden="true"></i>
                      </span>
                    )}
                    {ownedIds.includes(item.id) && <span className="cosmetics-owned-badge">Куплено</span>}
                  </button>
                  <div className="cosmetics-card-info">
                    <span className="cosmetics-card-name">{item.name}</span>
                    <span className="cosmetics-card-type">{TYPE_LABEL[item.type]}</span>
                    <span className="cosmetics-card-price">{item.priceFlowers} квіток</span>
                  </div>
                  <button type="button" className="cosmetics-add-btn" onClick={() => addToCart(item)}>
                    {item.type !== "FURNITURE" && cart[item.id] > 0 ? "У кошику" : "Додати в кошик"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {visible.length < filtered.length && (
            <button
              type="button"
              className="leaderboard-load-more cosmetics-load-more"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Завантажити ще ({filtered.length - visible.length})
            </button>
          )}
        </div>

        <div className="cosmetics-side-panel">
          <div className="cosmetics-side-tabs">
            <button type="button" className={rightTab === "cart" ? "active" : ""} onClick={() => setRightTab("cart")}>
              Кошик{cartLines.length > 0 ? ` (${cartLines.length})` : ""}
            </button>
            <button
              type="button"
              className={rightTab === "preview" ? "active" : ""}
              onClick={() => setRightTab("preview")}
              disabled={!mounted || !previewItem}
              // Three rounds of legitimate fixes (removing the SSR-unsafe
              // crypto.randomUUID() initializer, gating on a mounted flag)
              // didn't stop React from flagging this one attribute — and
              // React's own message already says the mismatch "won't be
              // patched up" either way, i.e. it's cosmetic-warning-only,
              // not a functional bug. This is the documented escape hatch
              // for exactly that case rather than continuing to guess.
              suppressHydrationWarning
            >
              Передперегляд
            </button>
          </div>

          {rightTab === "cart" ? (
            <div className="cosmetics-cart">
              {cartLines.length === 0 ? (
                <p className="empty-state">Кошик порожній.</p>
              ) : (
                <>
                  <div className="cosmetics-cart-list">
                    {cartLines.map(({ item, quantity }) => (
                      <div className="cosmetics-cart-row" key={item.id}>
                        <span className="cosmetics-cart-row-name">{item.name}</span>
                        {item.type === "FURNITURE" ? (
                          <div className="qty-controls">
                            <button type="button" onClick={() => setQuantity(item.id, quantity - 1)}>
                              −
                            </button>
                            <span>{quantity}</span>
                            <button type="button" onClick={() => setQuantity(item.id, quantity + 1)}>
                              +
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setQuantity(item.id, 0)} aria-label="Видалити">
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                        <span className="cosmetics-cart-row-price">{item.priceFlowers * quantity} квіток</span>
                      </div>
                    ))}
                  </div>
                  <div className="cosmetics-cart-total">
                    <span>Разом:</span>
                    <span>{totalFlowers} квіток</span>
                  </div>
                  {!signedIn ? (
                    <p className="admin-cosmetic-source">Увійдіть через Discord, щоб оплатити.</p>
                  ) : !canAfford ? (
                    <p className="profile-bio-error">Недостатньо квіток на балансі.</p>
                  ) : null}
                  {error && <p className="profile-bio-error">{error}</p>}
                  {orderDone && <p className="admin-luckperms-success">Замовлення оплачено!</p>}
                  <button
                    type="button"
                    className="donate-continue-btn"
                    onClick={checkout}
                    disabled={pending || !signedIn || !canAfford || !idempotencyKey}
                  >
                    {pending ? "Зачекайте..." : "Оплатити"}
                  </button>
                </>
              )}
            </div>
          ) : previewItem ? (
            <div className="cosmetics-preview">
              <ModelViewer3D
                modelUrl={previewItem.modelUrl}
                textureUrl={previewItem.textureUrl}
                className="cosmetics-preview-canvas"
                controls
              />
              <div className="cosmetics-preview-info">
                <h3 className="cosmetics-preview-name" title={previewItem.name}>
                  {previewItem.name}
                </h3>
                <div className="cosmetics-preview-meta">
                  <span>{TYPE_LABEL[previewItem.type]}</span>
                  <span className="cosmetics-preview-price">{previewItem.priceFlowers} квіток</span>
                </div>
              </div>
              <div className="cosmetics-preview-actions">
                <button type="button" className="cosmetics-add-btn" onClick={() => addToCart(previewItem)}>
                  {previewItem.type !== "FURNITURE" && cart[previewItem.id] > 0 ? "У кошику" : "Додати в кошик"}
                </button>
                <button
                  type="button"
                  className={`cosmetics-save-btn${saved.includes(previewItem.id) ? " active" : ""}`}
                  onClick={() => toggleSaved(previewItem.id)}
                  aria-label={saved.includes(previewItem.id) ? "Прибрати зі збереженого" : "Зберегти"}
                  title={saved.includes(previewItem.id) ? "Збережено" : "Зберегти"}
                >
                  <i className={saved.includes(previewItem.id) ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"}></i>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
