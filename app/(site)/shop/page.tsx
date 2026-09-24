import type { Metadata } from "next";
import Link from "next/link";
import { getDisabledPages, isPageAvailable } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Донат - Квітковий",
};

const CATEGORIES = [
  {
    key: "sponsorship",
    href: "/shop/sponsorship",
    icon: "fa-solid fa-crown",
    title: "Спонсорство",
    text: "Привілеї та можливості, що підтримують розвиток серверу.",
  },
  {
    key: "cosmetics",
    href: "/shop/cosmetics",
    icon: "fa-solid fa-wand-magic-sparkles",
    title: "Косметика",
    text: "Декорації та косметичні прикраси для твого персонажа.",
  },
] as const;

export default async function ShopPage() {
  const [available, disabled] = await Promise.all([
    Promise.all(CATEGORIES.map((c) => isPageAvailable(c.key))),
    getDisabledPages(),
  ]);

  return (
    <div className="shop-categories">
      {CATEGORIES.map((c, i) => {
        const body = (
          <>
            <i className={c.icon}></i>
            <h2>{c.title}</h2>
            <p>{c.text}</p>
          </>
        );
        // Switched off in /admin: an inert card, not a link (the section
        // itself 404s too — see its layout).
        return available[i] ? (
          <Link key={c.key} href={c.href} className="shop-category-card">
            {/* Admins can still open a switched-off section — the badge is
                what tells them it's off for everyone else. */}
            {disabled.includes(c.key) && <span className="shop-category-badge">Вимкнено для гравців</span>}
            {body}
          </Link>
        ) : (
          <div key={c.key} className="shop-category-card shop-category-card-disabled" aria-disabled="true">
            <span className="shop-category-badge">Недоступно</span>
            {body}
          </div>
        );
      })}
    </div>
  );
}
