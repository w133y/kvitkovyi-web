"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Головна" },
  { href: "/join", label: "Приєднатися" },
  { href: "/wiki", label: "Вікі" },
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

  // "Головна"/"Приєднатися" both have the full hero header — arriving here
  // from a DIFFERENT page should land on it (the in-place click handler
  // below only covers already being on the page). Next's own scroll-to-top
  // on navigation doesn't reliably land at true y=0 here (the fixed nav
  // plus the 100vh hero seem to throw off whatever heuristic it uses), so
  // this forces it once pathname actually becomes one of them. Skipped when
  // the URL has a hash (e.g. /#gallery from the gallery page's back link)
  // — that's a deliberate jump to a section, not "top".
  useEffect(() => {
    if ((pathname === "/" || pathname === "/join") && !window.location.hash) {
      // Explicit behavior:"auto" — globals.css now sets scroll-behavior:
      // smooth on html for the nav's own animated scroll below, which would
      // otherwise also animate this "just arrived" jump.
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  const isProfilePage = pathname.startsWith("/profile");
  const isAdminPage = pathname.startsWith("/admin");
  const isLeaderboardPage = pathname.startsWith("/leaderboard");
  const isGalleryPage = pathname.startsWith("/gallery");
  const isWikiPage = pathname.startsWith("/wiki");
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
    isWikiPage ||
    isAuthErrorPage ||
    isMapPage ||
    isBareHeaderShopPage;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // "/" and "/join" both have the full hero header — while already on one
  // of them, clicking its own nav tab again is more useful as a "skip the
  // hero" shortcut than a Link that's a no-op (same href, no navigation).
  // Relying on <Link>'s onClick + preventDefault to swallow the navigation
  // turned out unreliable (still not animating on some clicks) — a plain
  // <button> instead, for exactly this one case, removes any ambiguity
  // about Link's own click handling entirely.
  //
  // The scroll itself is hand-animated rather than window.scrollTo's own
  // behavior:"smooth" — that option silently snaps to an instant jump
  // whenever the OS/browser's "reduce motion" accessibility setting is on,
  // which is exactly the "teleports instead of sliding" symptom this was
  // written to fix. requestAnimationFrame isn't subject to that override.
  function scrollPastHeader() {
    const headerEl = document.querySelector("header");
    const targetY = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const durationMs = 600;
    const startTime = performance.now();

    function step(now: number) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      // easeInOutQuad
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      window.scrollTo(0, startY + distance * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function NavItem({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
    const active = isActive(href);
    const skipsToContent = (href === "/" || href === "/join") && active;

    if (skipsToContent) {
      return (
        <button
          type="button"
          className="active"
          onClick={() => {
            scrollPastHeader();
            onNavigate?.();
          }}
        >
          {label}
        </button>
      );
    }

    return (
      <Link href={href} className={active ? "active" : ""} onClick={onNavigate}>
        {label}
      </Link>
    );
  }

  return (
    <header className={isMapPage ? "header-map" : isSlimHeader ? "header-slim" : undefined}>
      <div className={scrolled ? "nav-scroll-blur visible" : "nav-scroll-blur"} aria-hidden="true"></div>
      <nav>
        <div className="container-text">
          <ul className="menutext">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavItem href={link.href} label={link.label} />
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
                <NavItem href={link.href} label={link.label} onNavigate={() => setMenuOpen(false)} />
              </li>
            ))}
          </ul>
          <div className="mobile-menu-auth">{userMenu}</div>
        </div>
      </div>

      {!isSlimHeader && (
        <div className="header-img">
          <div className="img">
            {pathname === "/join" ? (
              <Image
                src="/img/join.png"
                alt="Як приєднатися?"
                width={1010}
                height={118}
                priority
                className="header-img-join"
              />
            ) : (
              <Image src="/img/logo.png" alt="Title" width={400} height={400} priority />
            )}
          </div>
        </div>
      )}
    </header>
  );
}
