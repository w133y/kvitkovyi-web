"use client";

import { useEffect, useRef, useState } from "react";
import type { ChannelImagePage, ChannelImagePost } from "@/lib/discord";
import { loadMoreArchivePosts } from "@/lib/actions/archive";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
}

// Pages open two at a time, like a real spread — [1,2], [3,4], ... A trailing
// odd page (an issue with an odd page count) is its own last spread of one,
// shown centered instead of paired with nothing.
function toSpreads(pages: ChannelImagePage[]): ChannelImagePage[][] {
  const spreads: ChannelImagePage[][] = [];
  for (let i = 0; i < pages.length; i += 2) spreads.push(pages.slice(i, i + 2));
  return spreads;
}

const HOLD_TO_TURN_MS = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

// Same fullscreen-lightbox behavior as /gallery's GalleryGrid, trimmed to
// what an archive post actually has (a Discord message's own text as the
// caption, its timestamp — no season/author toggles, those are gallery-only
// concepts with no equivalent here). One extra dimension gallery photos
// don't have: an issue can be several page images posted in the same
// message — the lightbox arrows page through the OPEN issue's spreads
// rather than jumping between issues; browsing a different issue means
// closing and picking another card, same as before.
export default function ArchiveGrid({
  initialPosts,
  initialNextBefore,
}: {
  initialPosts: ChannelImagePost[];
  initialNextBefore: string | null;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [nextBefore, setNextBefore] = useState(initialNextBefore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [transformOrigin, setTransformOrigin] = useState("50% 50%");
  const spreadRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);

  async function handleLoadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadMoreArchivePosts(nextBefore);
      setPosts((prev) => [...prev, ...page.posts]);
      setNextBefore(page.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  }

  function openPost(i: number) {
    setOpenIndex(i);
    setSpreadIndex(0);
  }

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (openIndex === null) return;
    const spreadCount = toSpreads(posts[openIndex].pages).length;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowRight") setSpreadIndex((s) => (s + 1) % spreadCount);
      if (e.key === "ArrowLeft") setSpreadIndex((s) => (s - 1 + spreadCount) % spreadCount);
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      clearHoldTimer();
    };
  }, [openIndex, posts]);

  // A fresh page/spread starts at 1x, centered — zoom doesn't carry over to
  // the next page turn.
  useEffect(() => {
    setZoom(1);
    setTransformOrigin("50% 50%");
  }, [openIndex, spreadIndex]);

  // Wheel-to-zoom needs a real (non-passive) listener — React's own onWheel
  // is attached passive by default, so e.preventDefault() there silently
  // does nothing and the page behind the lightbox scrolls instead of the
  // image zooming. Re-centers on the cursor on every tick (not just the
  // first) so zooming further in keeps tracking wherever the mouse actually
  // is instead of drifting back toward the middle.
  useEffect(() => {
    const el = spreadRef.current;
    if (!el || openIndex === null) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      setTransformOrigin(`${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`);
      setZoom((z) => {
        const next = z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [openIndex, spreadIndex]);

  const active = openIndex === null ? null : posts[openIndex];
  const spreads = active ? toSpreads(active.pages) : [];
  const activeSpread = spreads[spreadIndex];
  const pageStart = spreadIndex * 2 + 1;
  const pageEnd = activeSpread ? pageStart + activeSpread.length - 1 : pageStart;

  // Press and hold the left/right half of the open spread to turn the page —
  // a quick click still just does nothing (same as before), it takes an
  // actual hold to trigger the turn, so it doesn't fight with wheel-zooming
  // or the arrow buttons sitting right next to it.
  function handleSpreadPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (spreads.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isRight = e.clientX - rect.left > rect.width / 2;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setSpreadIndex((s) => (isRight ? (s + 1) % spreads.length : (s - 1 + spreads.length) % spreads.length));
    }, HOLD_TO_TURN_MS);
  }

  return (
    <>
      <div className="gallery-page-grid">
        {posts.map((post, i) => (
          <button
            type="button"
            className="gallery-page-card"
            key={post.id}
            onClick={() => openPost(i)}
            aria-label="Відкрити на весь екран"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.pages[0].url}
              width={post.pages[0].width}
              height={post.pages[0].height}
              alt="Газета"
              loading="lazy"
              draggable={false}
            />
            {post.pages.length > 1 && (
              <span className="archive-page-count">
                <i className="fa-solid fa-images" aria-hidden="true"></i>
                {post.pages.length}
              </span>
            )}
            <div className="gallery-page-card-info">
              <span className="gallery-page-card-season">{formatDate(post.timestamp)}</span>
              {post.content && <span className="gallery-page-card-desc">{post.content}</span>}
            </div>
          </button>
        ))}
      </div>

      {nextBefore && (
        <button type="button" className="leaderboard-load-more" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Завантаження..." : "Завантажити ще"}
        </button>
      )}

      {active && activeSpread && (
        <div className="gallery-lightbox" onClick={() => setOpenIndex(null)}>
          <button
            type="button"
            className="gallery-lightbox-close"
            onClick={() => setOpenIndex(null)}
            aria-label="Закрити"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>

          {spreads.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-arrow gallery-lightbox-arrow-prev"
              onClick={(e) => {
                e.stopPropagation();
                setSpreadIndex((s) => (s - 1 + spreads.length) % spreads.length);
              }}
              aria-label="Попередній розворот"
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>
          )}

          <div
            ref={spreadRef}
            className={`archive-spread${activeSpread.length === 1 ? " archive-spread-single" : ""}`}
            style={{ transform: `scale(${zoom})`, transformOrigin }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={handleSpreadPointerDown}
            onPointerUp={clearHoldTimer}
            onPointerLeave={clearHoldTimer}
          >
            {activeSpread.map((page) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.url}
                src={page.url}
                width={page.width}
                height={page.height}
                alt="Газета"
                draggable={false}
              />
            ))}
          </div>

          {spreads.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-arrow gallery-lightbox-arrow-next"
              onClick={(e) => {
                e.stopPropagation();
                setSpreadIndex((s) => (s + 1) % spreads.length);
              }}
              aria-label="Наступний розворот"
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          )}

          {(active.content || active.pages.length > 1) && (
            <div className="gallery-lightbox-caption" onClick={(e) => e.stopPropagation()}>
              {active.content && <div className="slide-caption-desc">{active.content}</div>}
              {active.pages.length > 1 && (
                <div className="slide-caption-author">
                  {pageStart === pageEnd ? (
                    <>Сторінка {pageStart} з {active.pages.length}</>
                  ) : (
                    <>
                      Сторінки {pageStart}–{pageEnd} з {active.pages.length}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
