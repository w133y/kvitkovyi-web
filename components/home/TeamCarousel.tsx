"use client";

import { useEffect, useRef, useState } from "react";

const TEAM = [
  { nick: "_Ameo_", image: "/img/ameio.webp", position: "Засновник" },
  { nick: "Memushka", image: "/img/mim.webp", position: "Ком'юніті та івенти" },
  { nick: "natashy", image: "/img/artek.webp", position: "Співзасновник" },
  { nick: "DarklyFoxs", image: "/img/darkly.webp", position: "Тех. адмін" },
  { nick: "w1z4r_d", image: "/img/w1z.webp", position: "Візя" },
  { nick: "Crazy_LeV", image: "/img/lev.webp", position: "Лев" },
];

const GAP_PX = 40;

export default function TeamCarousel() {
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const calculateVisibleCount = () => {
    const viewWidth = viewRef.current?.clientWidth ?? 0;
    // Pure width math (viewWidth / minCardWidth) still let 2-3 narrow cards
    // fit side by side up to ~768px wide — same mobile breakpoint the rest
    // of the site uses elsewhere, just enforced here in JS since this
    // layout is computed, not CSS media queries.
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 650;
    const maxVisible = isMobile ? 1 : 4;
    const minCardWidth = 180;
    for (let slidesCount = maxVisible; slidesCount > 0; slidesCount--) {
      const totalGaps = (slidesCount - 1) * GAP_PX;
      const cardWidth = (viewWidth - totalGaps) / slidesCount;
      if (cardWidth >= minCardWidth) {
        return { visibleCount: slidesCount, cardWidth };
      }
    }
    return { visibleCount: 1, cardWidth: minCardWidth };
  };

  useEffect(() => {
    function updateLayout() {
      const { visibleCount, cardWidth } = calculateVisibleCount();
      cardRefs.current.forEach((card) => {
        if (card) card.style.width = `${cardWidth}px`;
      });
      setCurrentIndex((index) => Math.max(Math.min(index, TEAM.length - visibleCount), 0));
    }

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  useEffect(() => {
    const firstCard = cardRefs.current[0];
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 0;
    const offset = (cardWidth + GAP_PX) * currentIndex;
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(-${offset}px)`;
    }
  }, [currentIndex]);

  const slideNext = () => {
    const { visibleCount } = calculateVisibleCount();
    setCurrentIndex((index) => {
      const next = index + 1;
      return next > TEAM.length - visibleCount ? 0 : next;
    });
  };

  const slidePrev = () => {
    const { visibleCount } = calculateVisibleCount();
    setCurrentIndex((index) => {
      const prev = index - 1;
      if (prev < 0) {
        return Math.max(TEAM.length - visibleCount, 0);
      }
      return prev;
    });
  };

  return (
    <div className="cards_bg">
      <div className="unique-carousel-wrapper">
        <button className="unique-carousel-btn unique-carousel-btn-prev" aria-label="Previous slide" onClick={slidePrev}>
          <svg viewBox="0 0 24 24">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>

        <div className="unique-carousel-view" ref={viewRef}>
          <div className="unique-carousel-track" ref={trackRef}>
            {TEAM.map((member, i) => (
              <div
                className="unique-carousel-card"
                key={member.nick}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
              >
                <div className="unique-carousel-nick">{member.nick}</div>
                <div className="unique-carousel-image">
                  {/* No loading="lazy" — Safari's native lazy-load can fail
                      to ever fire for an image whose container only gets
                      its real size from JS after first render (the card
                      width here is set in a useEffect, not CSS), which is
                      what was making these never show up on iPhones. Only
                      5 small images, so eager loading costs nothing. */}
                  <img src={member.image} alt={member.nick} />
                </div>
                <div className="unique-carousel-position">{member.position}</div>
              </div>
            ))}
          </div>
        </div>

        <button className="unique-carousel-btn unique-carousel-btn-next" aria-label="Next slide" onClick={slideNext}>
          <svg viewBox="0 0 24 24">
            <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
