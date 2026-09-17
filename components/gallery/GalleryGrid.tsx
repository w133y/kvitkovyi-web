"use client";

import { useEffect, useState } from "react";
import type { GalleryPhoto } from "@prisma/client";

// The /gallery page used to be a plain static grid with no way to see any
// photo larger than its thumbnail — this adds a fullscreen lightbox (click a
// card, arrow through the rest, Escape/backdrop/× to close) without touching
// how the grid itself is fetched or sorted server-side.
export default function GalleryGrid({ photos }: { photos: GalleryPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    }
    document.addEventListener("keydown", onKeyDown);
    // The lightbox covers the whole viewport — no reason for the page body
    // behind it to also scroll while it's open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [openIndex, photos.length]);

  const active = openIndex === null ? null : photos[openIndex];

  return (
    <>
      <div className="gallery-page-grid">
        {photos.map((photo, i) => (
          <button
            type="button"
            className="gallery-page-card"
            key={photo.id}
            onClick={() => setOpenIndex(i)}
            aria-label="Відкрити фото на весь екран"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Фото галереї" loading="lazy" />
            <div className="gallery-page-card-info">
              <span className="gallery-page-card-season">Сезон {photo.season}</span>
              {photo.showDescription && photo.description && (
                <span className="gallery-page-card-desc">{photo.description}</span>
              )}
              {photo.showAuthor && photo.author && (
                <span className="gallery-page-card-author">Фото: {photo.author}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="gallery-lightbox" onClick={() => setOpenIndex(null)}>
          <button
            type="button"
            className="gallery-lightbox-close"
            onClick={() => setOpenIndex(null)}
            aria-label="Закрити"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>

          {photos.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-arrow gallery-lightbox-arrow-prev"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
              }}
              aria-label="Попереднє фото"
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt="Фото галереї"
            className="gallery-lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />

          {photos.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-arrow gallery-lightbox-arrow-next"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
              }}
              aria-label="Наступне фото"
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          )}

          {((active.showAuthor && active.author) || (active.showDescription && active.description)) && (
            <div className="gallery-lightbox-caption" onClick={(e) => e.stopPropagation()}>
              {active.showDescription && active.description && (
                <div className="slide-caption-desc">{active.description}</div>
              )}
              {active.showAuthor && active.author && (
                <div className="slide-caption-author">Автор: {active.author}</div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
