"use client";

// Fade-up-on-scroll for page blocks and cards. Only elements that start
// BELOW the viewport get hidden (so nothing already on screen flashes), and
// the hiding class is added by this script — without JS everything simply
// stays visible. Also picks up cards added later ("Завантажити ще").

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGETS = [
  ".site-main .box",
  ".site-main .box2",
  ".site-main .box3",
  ".feature",
  ".rules-column",
  ".shop-category-card",
  ".cosmetics-card",
  ".achievement-card",
  ".stat-box",
  ".donate-col",
  ".gallery-page-grid > *",
].join(",");

export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("reveal-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
        if (el.dataset.reveal) return;
        el.dataset.reveal = "1";
        if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible
        // Small stagger between siblings in the same row/grid.
        const index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = `${(index % 6) * 60}ms`;
        el.classList.add("reveal");
        io.observe(el);
      });
    };

    scan();
    const main = document.querySelector(".site-main");
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    });
    if (main) mo.observe(main, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
