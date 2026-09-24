"use client";

// Renders one cosmetic's vanilla Java block-model JSON + texture, drag-to-
// rotate. Used three ways: the admin upload preview, the public catalog's
// detail panel, and (via onReady's canvas) the client-captured baked
// thumbnail on publish — one renderer, no server-side rendering needed.
//
// deepslate (github.com/misode/deepslate) parses/renders this exact format
// itself — it already ships its own WebGL renderer, so this does NOT use
// three.js alongside it (two WebGL stacks fighting over one canvas would be
// redundant, not complementary). BlockModel.fromJson's BlockModelElement
// type is a verified 1:1 match for the real pack JSON (elements/faces/uv),
// see lib/cosmetics/nexo-pack.ts.

import { useEffect, useRef, useState } from "react";
import { mat4 } from "gl-matrix";
import { BlockModel, TextureAtlas, Cull, Renderer, Identifier, type Mesh } from "deepslate";

// Draw sequence mirrors deepslate's own ItemRenderer.drawItem() exactly:
// setShader → setTexture → prepareDraw → drawMesh. The base Renderer
// compiles its shader but never activates it (gl.useProgram) on its own —
// skipping setShader made every draw a silent no-op ("no valid shader
// program in use", confirmed in headless Chrome), which is why previews
// were blank and the thumbnail baker captured blank frames.
class SingleModelRenderer extends Renderer {
  private mesh: Mesh;
  private atlasTexture: WebGLTexture;
  private pixelSizeValue: number | undefined;

  constructor(gl: WebGLRenderingContext, model: BlockModel, atlas: TextureAtlas) {
    super(gl);
    // Culling is tuned for deepslate's own structure camera; a single small
    // item gains nothing from it and risks faces vanishing at some angles.
    gl.disable(gl.CULL_FACE);
    this.mesh = model.getMesh(atlas, Cull.none());
    this.mesh.computeNormals();
    this.mesh.rebuild(gl, { pos: true, color: true, texture: true, normal: true });
    this.atlasTexture = this.createAtlasTexture(atlas.getTextureAtlas());
    this.pixelSizeValue = atlas.getPixelSize();
  }

  draw(viewMatrix: mat4) {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.setShader(this.shaderProgram);
    this.setTexture(this.atlasTexture, this.pixelSizeValue);
    this.prepareDraw(viewMatrix);
    this.drawMesh(this.mesh, { pos: true, color: true, texture: true, normal: true });
  }
}

// deepslate's TextureAtlas.fromBlobs only copies a 16x16 region of each
// texture (built for vanilla 16px block textures) — cosmetic textures are
// 32/64px+, so it sampled a mostly-transparent corner and the shader's
// alpha discard blanked every pixel. Builds a single-texture atlas from the
// FULL image instead: drawn at native size onto a power-of-two canvas
// (TextureAtlas requires it), UV range covering just the image's area.
// Model UVs are always 0-16 over the whole texture regardless of its
// resolution, so this maps correctly for any texture size.
async function buildAtlas(textureRefs: string[], blob: Blob): Promise<TextureAtlas> {
  const img = await createImageBitmap(blob);
  const size = 2 ** Math.ceil(Math.log2(Math.max(img.width, img.height, 16)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  // An animated texture (.png.mcmeta in the pack) is a vertical strip of
  // square frames — map only the first frame, like the game's first tick,
  // instead of squashing the whole strip onto the model.
  // ponytail: detected by shape (height an exact multiple of width); a
  // genuinely tall non-animated texture would be cropped too — store an
  // "animated" flag per item if one ever turns up.
  const frameHeight = img.height > img.width && img.height % img.width === 0 ? img.width : img.height;
  const uv: [number, number, number, number] = [0, 0, img.width / size, frameHeight / size];
  // Keyed through Identifier so an un-namespaced ref ("block/x") matches
  // the "minecraft:block/x" deepslate looks it up by. Every ref maps to the
  // one texture this app stores per item.
  const idMap = Object.fromEntries(textureRefs.map((ref) => [Identifier.parse(ref).toString(), uv]));
  return new TextureAtlas(ctx.getImageData(0, 0, size, size), idMap);
}

// Frames the camera on the model's own element bounding box — models
// routinely extend past the nominal 0-16 block cube (a wide planter, a tall
// tent), so a fixed target/distance cropped them. The bounding sphere keeps
// the whole model in view at any drag angle.
const FOV = (70 * Math.PI) / 180; // matches deepslate Renderer.getPerspective()

function frameModel(elements: { from: number[]; to: number[] }[] | undefined) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const e of elements ?? []) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], e.from[i], e.to[i]);
      max[i] = Math.max(max[i], e.from[i], e.to[i]);
    }
  }
  if (!Number.isFinite(min[0])) return { target: [8, 8, 8] as [number, number, number], radius: 14 };
  const target: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { target, radius };
}

// FOV is vertical; on a portrait canvas the horizontal extent is the tighter
// one, so fit against whichever half-angle is smaller.
function cameraDistance(radius: number, aspect: number) {
  const halfFov = Math.atan(Math.tan(FOV / 2) * Math.min(1, aspect));
  // A strict sphere fit (radius / sin) left long, flat models (a 3-block
  // planter) tiny in frame; the tangent fit is tighter and still keeps the
  // box itself in view from the default angle.
  return (radius / Math.tan(halfFov)) * 0.85;
}


type ViewMode = "rotate" | "zoom" | "pan";

const MODE_BUTTONS: { mode: ViewMode; icon: string; label: string }[] = [
  { mode: "rotate", icon: "fa-solid fa-rotate", label: "Поворот" },
  { mode: "zoom", icon: "fa-solid fa-magnifying-glass-plus", label: "Наближення" },
  { mode: "pan", icon: "fa-solid fa-up-down-left-right", label: "Переміщення" },
];

const DEFAULT_YAW = Math.PI / 4;
const DEFAULT_PITCH = -Math.PI / 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

export default function ModelViewer3D({
  modelUrl,
  textureUrl,
  className,
  onReady,
  controls = false,
}: {
  modelUrl: string;
  textureUrl: string;
  className?: string;
  onReady?: (canvas: HTMLCanvasElement) => void;
  // Shows the rotate / zoom / pan / reset toolbar — the shop preview uses
  // it; thumbnails and the admin list don't need it.
  controls?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Surfaced instead of a silent blank canvas when WebGL, a fetch or the
  // model itself fails.
  const [error, setError] = useState<string | null>(null);
  // Which modelUrl has finished its first frame — exposed as data-ready so
  // automation (thumbnail baking) can wait for the real render.
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("rotate");
  // Refs, not effect dependencies: callers pass a fresh inline onReady each
  // render, and switching mode must not rebuild the WebGL context.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, alpha: true });
    if (!gl) {
      setError("WebGL недоступний у цьому браузері");
      return;
    }

    let cancelled = false;
    let renderer: SingleModelRenderer | null = null;
    let frame = frameModel(undefined);
    let yaw = DEFAULT_YAW;
    let pitch = DEFAULT_PITCH;
    let zoom = 1;
    let pan: [number, number, number] = [0, 0, 0];

    function camera() {
      const target: [number, number, number] = [
        frame.target[0] + pan[0],
        frame.target[1] + pan[1],
        frame.target[2] + pan[2],
      ];
      const distance = cameraDistance(frame.radius, canvas!.width / Math.max(1, canvas!.height)) * zoom;
      const eye: [number, number, number] = [
        target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
        target[1] - distance * Math.sin(pitch),
        target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
      ];
      return { target, eye, distance };
    }

    function render() {
      if (!renderer || !gl || !canvas) return;
      const { target, eye } = camera();
      const view = mat4.create();
      mat4.lookAt(view, eye, target, [0, 1, 0]);
      renderer.draw(view);
    }

    resetRef.current = () => {
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      zoom = 1;
      pan = [0, 0, 0];
      render();
    };

    async function load() {
      try {
        const [modelRes, textureRes] = await Promise.all([fetch(modelUrl), fetch(textureUrl)]);
        if (!modelRes.ok) throw new Error(`modelUrl ${modelRes.status}`);
        if (!textureRes.ok) throw new Error(`textureUrl ${textureRes.status}`);
        const [modelJson, textureBlob] = await Promise.all([modelRes.json(), textureRes.blob()]);
        if (cancelled) return;

        const textureRefs = Object.values(modelJson.textures ?? {}).filter(
          (v): v is string => typeof v === "string" && !v.startsWith("#")
        );
        if (textureRefs.length === 0) throw new Error("model JSON has no texture reference");

        const atlas = await buildAtlas(textureRefs, textureBlob);
        const model = BlockModel.fromJson(modelJson);
        if (cancelled || !gl) return;

        frame = frameModel(modelJson.elements);
        renderer = new SingleModelRenderer(gl, model, atlas);
        // Size the canvas before the first frame — onReady captures it (the
        // thumbnail baker). The previous model's frame stays on the canvas
        // until this point, so switching items never flashes blank.
        resize();
        setReadyUrl(modelUrl);
        onReadyRef.current?.(canvas!);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не вдалося завантажити модель");
      }
    }

    function resize() {
      if (!canvas || !gl || !renderer) return;
      const { clientWidth, clientHeight } = canvas;
      canvas.width = clientWidth;
      canvas.height = clientHeight;
      renderer.setViewport(0, 0, clientWidth, clientHeight);
      render();
    }

    function applyZoom(factor: number) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    }

    // Moves the look-at target in the camera's own screen plane, scaled by
    // distance so a drag covers the same on-screen distance at any zoom.
    function applyPan(dx: number, dy: number) {
      const { target, eye, distance } = camera();
      const fl = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
      const f = [(target[0] - eye[0]) / fl, (target[1] - eye[1]) / fl, (target[2] - eye[2]) / fl];
      // right = normalize(cross(forward, worldUp)); up = cross(right, forward)
      const rl = Math.hypot(f[2], f[0]) || 1;
      const r = [-f[2] / rl, 0, f[0] / rl];
      const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const k = distance * 0.0025;
      pan = [
        pan[0] + (-dx * r[0] + dy * up[0]) * k,
        pan[1] + (-dx * r[1] + dy * up[1]) * k,
        pan[2] + (-dx * r[2] + dy * up[2]) * k,
      ];
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas!.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (modeRef.current === "zoom") {
        applyZoom(1 + dy * 0.005);
      } else if (modeRef.current === "pan") {
        applyPan(dx, dy);
      } else {
        yaw += dx * 0.01;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.01));
      }
      render();
    }
    function onPointerUp() {
      dragging = false;
    }
    // Non-passive so the page doesn't scroll while zooming over the model.
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      applyZoom(1 + e.deltaY * 0.001);
      render();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    if (controls) canvas.addEventListener("wheel", onWheel, { passive: false });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    load();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [modelUrl, textureUrl, controls]);

  const loading = !error && readyUrl !== modelUrl;
  const cursor = mode === "pan" ? "move" : mode === "zoom" ? "ns-resize" : "grab";

  // .model-viewer supplies the default 100%/100% size in CSS (not inline) so
  // a caller's className can actually override it.
  return (
    <div className={`model-viewer ${className ?? ""}`} data-ready={readyUrl ?? undefined}>
      <canvas
        ref={canvasRef}
        style={{ touchAction: "none", cursor, width: "100%", height: "100%", display: "block" }}
      />
      {loading && <span className="model-viewer-loading" aria-label="Завантаження" />}
      {error && <div className="cosmetics-viewer-error">{error}</div>}
      {controls && (
        <div className="model-viewer-toolbar">
          {MODE_BUTTONS.map((b) => (
            <button
              key={b.mode}
              type="button"
              className={mode === b.mode ? "active" : ""}
              onClick={() => setMode(b.mode)}
              title={b.label}
              aria-label={b.label}
            >
              <i className={b.icon} aria-hidden="true"></i>
            </button>
          ))}
          <button type="button" onClick={() => resetRef.current()} title="Скинути вид" aria-label="Скинути вид">
            <i className="fa-solid fa-house" aria-hidden="true"></i>
          </button>
        </div>
      )}
    </div>
  );
}
