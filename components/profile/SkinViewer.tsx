"use client";

import { useEffect, useRef, useState } from "react";

// Eases the camera from wherever the user dragged it back to the viewer's
// default front-facing pose, instead of resetCameraPose()'s instant snap.
// OrbitControls.update() re-derives its spherical state from camera.position
// fresh every frame (see three's OrbitControls source), so it's safe to
// drive camera.position externally like this — it won't fight our tween.
function animateResetCameraPose(viewer: import("skinview3d").SkinViewer, duration = 700) {
  const camera = viewer.camera;
  const startPos = camera.position.clone();

  const originalPos = camera.position.clone();
  viewer.resetCameraPose();
  const targetPos = camera.position.clone();
  camera.position.copy(originalPos);

  if (startPos.distanceTo(targetPos) < 0.01) return;

  const startTime = performance.now();
  function tick(now: number) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(startPos, targetPos, eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export default function SkinViewer({
  skinUrl,
  capeUrl,
  slim,
  nickname,
  // The donate builder's preview doesn't want these — download/expand only
  // make sense on the profile page's own skin card, and expanding here
  // used to grow the whole card to 407px tall, which (since the builder's
  // three columns share one stretched grid row) pushed the middle "Символ"
  // column's bounds around with it.
  showControls = true,
}: {
  skinUrl: string;
  capeUrl: string | null;
  slim: boolean;
  nickname: string;
  showControls?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<import("skinview3d").SkinViewer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    // The 3D viewer (and its WebGL context) can fail to spin up for reasons
    // outside our control — a stale JS chunk after a redeploy, a browser
    // that's out of WebGL contexts, etc. Without this catch, that becomes an
    // unhandled rejection that Next surfaces as a crash on the profile page;
    // instead we fall back to a flat 2D preview of the skin.
    import("skinview3d")
      .then(({ SkinViewer, IdleAnimation }) => {
        if (cancelled || !canvasRef.current) return;

        const viewer = new SkinViewer({
          canvas: canvasRef.current,
          width: 280,
          height: 407,
          fov: 45,
          zoom: 0.885,
        });
        viewer.controls.enableZoom = false;
        viewer.controls.enableRotate = false;

        const idle = new IdleAnimation();
        // Slow side-to-side head turn on top of the built-in breathing sway.
        idle.addAnimation((player, progress) => {
          player.skin.head.rotation.y = Math.sin(progress * 0.4) * 0.5;
        });
        viewer.animation = idle;

        viewer
          .loadSkin(skinUrl, { model: slim ? "slim" : "default" })
          .then(() => setLoaded(true))
          .catch((err) => {
            console.error("SkinViewer: loadSkin failed", err);
            setFailed(true);
          });

        if (capeUrl) {
          viewer.loadCape(capeUrl).catch(() => {});
        }

        viewerRef.current = viewer;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("SkinViewer: failed to initialize", err);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [skinUrl, capeUrl, slim]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Manual drag-to-rotate is only allowed once the card has expanded to
    // show the full body — in the compact waist-up view it would just
    // spin the crop around awkwardly.
    viewer.controls.enableRotate = expanded;
    // Collapsing back down resets any manual rotation the viewer picked up
    // while expanded, so the compact card always shows the same front pose.
    if (!expanded) {
      animateResetCameraPose(viewer);
    }
  }, [expanded, loaded]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(skinUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${nickname}-skin.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("SkinViewer: download failed", err);
    } finally {
      setDownloading(false);
    }
  }

  if (failed) {
    return (
      <div className="skin-viewer-wrapper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={skinUrl} alt={`Скін ${nickname}`} className="skin-viewer-fallback-img" />
        {showControls && (
          <button
            type="button"
            className="skin-viewer-icon-btn skin-viewer-icon-btn-left"
            title="Завантажити скін"
            aria-label="Завантажити скін"
            onClick={handleDownload}
            disabled={downloading}
          >
            <i className="fa-solid fa-download"></i>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={expanded ? "skin-viewer-wrapper expanded" : "skin-viewer-wrapper"}>
      <canvas ref={canvasRef} className={loaded ? "" : "skin-viewer-loading"} />

      {showControls && (
        <>
          <button
            type="button"
            className="skin-viewer-icon-btn skin-viewer-icon-btn-left"
            title="Завантажити скін"
            aria-label="Завантажити скін"
            onClick={handleDownload}
            disabled={downloading}
          >
            <i className="fa-solid fa-download"></i>
          </button>

          <button
            type="button"
            className={
              expanded
                ? "skin-viewer-icon-btn skin-viewer-icon-btn-right active"
                : "skin-viewer-icon-btn skin-viewer-icon-btn-right"
            }
            title={expanded ? "Згорнути скін" : "Розгорнути скін"}
            aria-label={expanded ? "Згорнути скін" : "Розгорнути скін"}
            onClick={() => setExpanded((prev) => !prev)}
          >
            <i className={expanded ? "fa-solid fa-compress" : "fa-solid fa-expand"}></i>
          </button>
        </>
      )}
    </div>
  );
}
