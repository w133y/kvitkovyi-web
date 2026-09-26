"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_PAGES, type SitePageKey } from "@/lib/site-pages";
import { useEffect, useRef, useState } from "react";

// icon: the phone/tablet bottom bar only — the desktop plate stays text.
const NAV_LINKS = [
  { href: "/", label: "Головна", icon: "fa-solid fa-house" },
  { href: "/join", label: "Приєднатися", icon: "fa-solid fa-play" },
  { href: "/wiki", label: "Вікі", icon: "fa-solid fa-book" },
  { href: "/map", label: "Мапа", icon: "fa-solid fa-map" },
];

// Tucked behind the "Інше" dropdown on the desktop plate instead of their
// own icons directly in the row — with the plate already at 4 items, more
// standalone entries just kept crowding it at in-between viewport widths.
// Still flat entries in the mobile menu (see the second NAV_LINKS.map
// below), which has vertical room to spare.
const MORE_LINKS = [
  { href: "/leaderboard", label: "Таблиця лідерів", icon: "fa-solid fa-ranking-star" },
  { href: "/gallery", label: "Галерея", icon: "fa-regular fa-images" },
  { href: "/archive", label: "Архів", icon: "fa-solid fa-newspaper" },
];

export default function SiteHeader({
  userMenu,
  heroImage,
  hiddenPages = [],
}: {
  userMenu?: React.ReactNode;
  // Sections an admin switched off (lib/page-access.ts) — their links are
  // dropped for this visitor; the pages themselves 404 server-side.
  hiddenPages?: SitePageKey[];
  // global-not-found.tsx wants the exact same full hero everyone else gets
  // (same header.webp scene, same 100vh treatment, nav floating on top) —
  // just showing 404.png in the image slot instead of the usual logo.
  heroImage?: "404";
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const hiddenPaths = new Set<string>(SITE_PAGES.filter((p) => hiddenPages.includes(p.key)).map((p) => p.path));
  const navLinks = NAV_LINKS.filter((l) => !hiddenPaths.has(l.href));
  const moreLinks = MORE_LINKS.filter((l) => !hiddenPaths.has(l.href));
  // Close the mobile menu on any navigation — covers links it doesn't own
  // (the profile/donate/admin links inside {userMenu}).
  useEffect(() => setMenuOpen(false), [pathname]);
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
  const isArchivePage = pathname.startsWith("/archive");
  const isWikiPage = pathname.startsWith("/wiki");
  const isAuthErrorPage = pathname.startsWith("/auth/error");
  const isMapPage = pathname === "/map";
  const isLegalPage = pathname === "/privacy" || pathname === "/terms" || pathname === "/offer";
  // /shop (the category chooser), every /shop/sponsorship/* page (the
  // builder, its info page, its payment page), and /shop/cosmetics (a dense
  // catalog — a big hero image just pushes all 350+ items further down)
  // drop the hero image.
  const isBareHeaderShopPage =
    pathname === "/shop" || pathname.startsWith("/shop/sponsorship") || pathname.startsWith("/shop/cosmetics");
  const isSlimHeader =
    isProfilePage ||
    isAdminPage ||
    isLeaderboardPage ||
    isGalleryPage ||
    isArchivePage ||
    isWikiPage ||
    isAuthErrorPage ||
    isMapPage ||
    isLegalPage ||
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

  function NavItem({
    href,
    label,
    icon,
    onNavigate,
  }: {
    href: string;
    label: string;
    icon?: string;
    onNavigate?: () => void;
  }) {
    const active = isActive(href);
    const skipsToContent = (href === "/" || href === "/join") && active;
    const content = icon ? (
      <>
        <i className={icon} aria-hidden="true"></i>
        <span className="nav-icon-label">{label}</span>
      </>
    ) : (
      label
    );

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
          {content}
        </button>
      );
    }

    return (
      <Link href={href} className={active ? "active" : ""} onClick={onNavigate} aria-label={icon ? label : undefined}>
        {content}
      </Link>
    );
  }

  function MoreMenu() {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLLIElement>(null);

    // Click still toggles it (state-driven, works everywhere, including
    // touch/keyboard) — hovering it open on a real mouse is CSS-only (see
    // ".nav-more:hover .nav-more-dropdown" in globals.css), scoped to
    // `(hover: hover) and (pointer: fine)` so it's a no-op on touch screens
    // instead of repeating the bug that made the profile menu unreliable on
    // mobile (see UserMenuDropdown) — a touch tap has no real ":hover", so
    // relying on it alone would leave touch users with no way to open this.
    useEffect(() => {
      if (!open) return;
      function handleClickOutside(e: MouseEvent) {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, [open]);

    const active = moreLinks.some((link) => isActive(link.href));

    return (
      <li className="nav-more" ref={rootRef}>
        <button type="button" className={active ? "active" : ""} onClick={() => setOpen((o) => !o)}>
          Інше
          <span className={`nav-more-arrow${open ? " open" : ""}`} aria-hidden="true">
            <span className="nav-more-arrow-flip">&gt;</span>
          </span>
        </button>
        <div className={`nav-more-dropdown${open ? " open" : ""}`}>
          {moreLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </li>
    );
  }

  return (
    <header className={isMapPage ? "header-map" : isSlimHeader ? "header-slim" : undefined}>
      <div className={scrolled ? "nav-scroll-blur visible" : "nav-scroll-blur"} aria-hidden="true"></div>
      <nav>
        <div className="container-text">
          <ul className="menutext">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavItem href={link.href} label={link.label} />
              </li>
            ))}
            {moreLinks.length > 0 && <MoreMenu />}
          </ul>
        </div>
        <div className="auth-widget">
          <div className="auth-widget-usermenu">{userMenu}</div>
        </div>
      </nav>

      {/* Phones/tablets: the main tabs as a bottom icon bar; "Меню" opens the
          overlay with everything else (other pages, profile, sign-in). */}
      {/* A div, not <nav>: "header nav" styles belong to the desktop plate. */}
      <div className="bottom-nav" role="navigation" aria-label="Навігація">
        {navLinks.map((link) => (
          <NavItem
            key={link.href}
            href={link.href}
            label={link.label}
            icon={link.icon}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
        <button
          type="button"
          className={menuOpen || !navLinks.some((l) => isActive(l.href)) ? "active" : ""}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
        >
          <i className={menuOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"} aria-hidden="true"></i>
          <span className="nav-icon-label">Меню</span>
        </button>
      </div>

      <div className={`mobile-menu ${menuOpen ? "active" : ""}`}>
        <div className="mobile-menu-container">
          <ul className="mobile-menutext">
            {/* Plain text like the rest of the mobile menu — the icons are for
                the desktop "Інше" dropdown only. */}
            {moreLinks.map((link) => (
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
            {heroImage === "404" ? (
              <Image src="/img/404.png" alt="404" width={1024} height={150} priority className="header-img-wide" />
            ) : pathname === "/join" ? (
              <Image
                src="/img/join.png"
                alt="Як приєднатися?"
                width={1010}
                height={118}
                priority
                className="header-img-wide"
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
