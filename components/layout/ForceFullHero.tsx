"use client";

import { useLayoutEffect } from "react";

// (site)/not-found.tsx renders inside (site)/layout.tsx, which already
// rendered <SiteHeader> as a sibling before {children} — a page has no way
// to hand SiteHeader a prop from there (context flows to descendants, and
// SiteHeader isn't one; it's already-rendered output above this one). That's
// why a 404 under a "slim header" section (/admin, /wiki, ...) used to show
// no hero at all while global-not-found.tsx's own <SiteHeader heroImage="404">
// got the full one — two different-looking 404 pages instead of one.
//
// This reaches back to the already-rendered <header> DOM node directly:
// drops header-slim so it goes back to its full 100vh height, and (if
// SiteHeader didn't render its own — it doesn't for slim pages) appends the
// same .header-img/404.png markup SiteHeader itself would render for
// heroImage="404". Runs in useLayoutEffect (before paint) to keep the
// server-rendered slim flash as short as possible; cleans up on unmount so
// navigating away restores the section's normal slim header.
export default function ForceFullHero() {
  useLayoutEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    const wasSlim = header.classList.contains("header-slim");
    header.classList.remove("header-slim");

    let heroEl = header.querySelector<HTMLDivElement>(".header-img");
    const created = !heroEl;
    if (!heroEl) {
      heroEl = document.createElement("div");
      heroEl.className = "header-img";
      heroEl.innerHTML =
        '<div class="img"><img src="/img/404.png" alt="404" class="header-img-wide" /></div>';
      header.appendChild(heroEl);
    }

    return () => {
      if (wasSlim) header.classList.add("header-slim");
      if (created) heroEl?.remove();
    };
  }, []);

  return null;
}
