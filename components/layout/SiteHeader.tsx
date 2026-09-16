"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Головна" },
  { href: "/join", label: "Приєднатися" },
  { href: "/map", label: "Мапа" },
];

export default function SiteHeader({ userMenu }: { userMenu?: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 1080);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isProfilePage = pathname.startsWith("/profile");
  const isAdminPage = pathname.startsWith("/admin");
  const isLeaderboardPage = pathname.startsWith("/leaderboard");
  const isGalleryPage = pathname.startsWith("/gallery");
  const isAuthErrorPage = pathname.startsWith("/auth/error");
  const isMapPage = pathname === "/map";
  // /shop (the category chooser) and every /shop/sponsorship/* page (the
  // builder, its info page, its payment page) drop the hero image;
  // /shop/cosmetics, cart, and checkout are unaffected.
  const isBareHeaderShopPage = pathname === "/shop" || pathname.startsWith("/shop/sponsorship");
  const isSlimHeader =
    isProfilePage ||
    isAdminPage ||
    isLeaderboardPage ||
    isGalleryPage ||
    isAuthErrorPage ||
    isMapPage ||
    isBareHeaderShopPage;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className={isMapPage ? "header-map" : isSlimHeader ? "header-slim" : undefined}>
      <div className={scrolled ? "nav-scroll-blur visible" : "nav-scroll-blur"} aria-hidden="true"></div>
      <nav>
        <div className="container-text">
          <ul className="menutext">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={isActive(link.href) ? "active" : ""}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-widget">
          <div className="auth-widget-usermenu">{userMenu}</div>
        </div>
      </nav>

      <div className="mobile-menu-button" onClick={() => setMenuOpen((open) => !open)}>
        <div className={`hamburger ${menuOpen ? "active" : ""}`}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div className={`mobile-menu ${menuOpen ? "active" : ""}`}>
        <div className="mobile-menu-container">
          <ul className="mobile-menutext">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={isActive(link.href) ? "active" : ""}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mobile-menu-auth">{userMenu}</div>
        </div>
      </div>

      {!isSlimHeader && (
        <div className="header-img">
          <div className="img">
            <Image src="/img/logo.png" alt="Title" width={400} height={400} priority />
          </div>
        </div>
      )}
    </header>
  );
}
