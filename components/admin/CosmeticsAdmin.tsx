"use client";

import { useRef, useState, useTransition } from "react";
import ModelViewer3D from "@/components/cosmetics/ModelViewer3D";
import {
  createCosmeticUploadUrl,
  stageUploadedPack,
  stageSingleModel,
  updateCosmeticDraft,
  deleteCosmeticDraft,
  publishCosmeticItem,
  updatePublishedCosmeticItem,
  listCosmeticIdsMissingThumbnail,
  setCosmeticThumbnail,
} from "@/lib/actions/cosmetics-admin";
import type { CosmeticType } from "@prisma/client";

const ADMIN_PAGE_SIZE = 20;

type CosmeticItemRow = {
  id: string;
  type: CosmeticType;
  nexoItemId: string;
  hmcCosmeticId: string | null;
  colorCustomizable: boolean;
  modelKey: string;
  textureKey: string;
  modelUrl: string;
  textureUrl: string;
  thumbnailUrl?: string | null;
  priceFlowers: number;
  sourcePackName: string | null;
  product: { name: string };
};

const TYPE_LABEL: Record<CosmeticType, string> = {
  HAT: "Шапочка",
  BACKPACK: "Бекпак",
  BALLOON: "Шарік",
  FURNITURE: "Меблі",
};

async function uploadToR2(file: File | Blob, contentType: string): Promise<{ key: string; publicUrl: string } | { error: string }> {
  const target = await createCosmeticUploadUrl(contentType);
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!res.ok) return { error: "Не вдалося завантажити файл" };
  return { key: target.key, publicUrl: target.publicUrl };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// A card's own 3D viewer is only ever mounted on demand (not eagerly for
// every card) — with hundreds of published items, mounting a live WebGL
// canvas per card would exceed the browser's concurrent-context limit
// (typically ~8-16 per page) and silently start failing.
function ModelPreviewToggle({
  modelUrl,
  textureUrl,
  thumbnailUrl,
  onFirstRender,
}: {
  modelUrl: string;
  textureUrl: string;
  thumbnailUrl?: string | null;
  onFirstRender?: (canvas: HTMLCanvasElement) => void;
}) {
  const [show3D, setShow3D] = useState(false);
  const captured = useRef(false);

  if (show3D) {
    return (
      <ModelViewer3D
        modelUrl={modelUrl}
        textureUrl={textureUrl}
        className="admin-cosmetic-preview-canvas"
        onReady={(canvas) => {
          if (captured.current) return;
          captured.current = true;
          onFirstRender?.(canvas);
        }}
      />
    );
  }
  return (
    <button type="button" className="admin-cosmetic-preview-placeholder" onClick={() => setShow3D(true)}>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" />
      ) : (
        <span>
          <i className="fa-solid fa-cube" aria-hidden="true"></i> Показати 3D
        </span>
      )}
    </button>
  );
}

function DraftCard({ item, onChanged }: { item: CosmeticItemRow; onChanged: () => void }) {
  const [name, setName] = useState(item.product.name);
  const [type, setType] = useState<CosmeticType>(item.type);
  const [priceFlowers, setPriceFlowers] = useState(item.priceFlowers);
  const [colorCustomizable, setColorCustomizable] = useState(item.colorCustomizable);
  const [nexoItemId, setNexoItemId] = useState(item.nexoItemId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateCosmeticDraft(item.id, { name, type, priceFlowers, colorCustomizable, nexoItemId });
      if ("error" in result) setError(result.error);
      else onChanged();
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      await save();
      const result = await publishCosmeticItem(item.id);
      if ("error" in result) setError(result.error);
      else onChanged();
    });
  }

  function remove() {
    if (!confirm(`Видалити чернетку "${item.product.name}"?`)) return;
    startTransition(async () => {
      await deleteCosmeticDraft(item.id);
      onChanged();
    });
  }

  return (
    <div className="admin-cosmetic-card">
      <div className="admin-cosmetic-preview">
        <ModelPreviewToggle modelUrl={item.modelUrl} textureUrl={item.textureUrl} thumbnailUrl={item.thumbnailUrl} />
      </div>
      <div className="admin-cosmetic-fields">
        {item.sourcePackName && <p className="admin-cosmetic-source">Пак: {item.sourcePackName}</p>}
        <label className="admin-field">
          Назва
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="admin-field">
          Тип
          <select value={type} onChange={(e) => setType(e.target.value as CosmeticType)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          id (латиниця, цифри, _)
          <input type="text" value={nexoItemId} onChange={(e) => setNexoItemId(e.target.value)} />
        </label>
        <label className="admin-field">
          Ціна (квітки)
          <input
            type="number"
            min={0}
            value={priceFlowers}
            onChange={(e) => setPriceFlowers(Number(e.target.value))}
          />
        </label>
        {type !== "FURNITURE" && (
          <label className="admin-checkbox-label">
            <input
              type="checkbox"
              checked={colorCustomizable}
              onChange={(e) => setColorCustomizable(e.target.checked)}
            />
            Можна змінювати колір (dye)
          </label>
        )}
        {error && <p className="profile-bio-error">{error}</p>}
        <div className="admin-form-actions">
          <button type="button" onClick={save} disabled={pending}>
            Зберегти
          </button>
          <button type="button" onClick={publish} disabled={pending}>
            Опублікувати
          </button>
          <button type="button" onClick={remove} disabled={pending}>
            Видалити
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishedCard({ item, onChanged }: { item: CosmeticItemRow; onChanged: () => void }) {
  const [name, setName] = useState(item.product.name);
  const [priceFlowers, setPriceFlowers] = useState(item.priceFlowers);
  const [colorCustomizable, setColorCustomizable] = useState(item.colorCustomizable);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textureInputRef = useRef<HTMLInputElement>(null);

  function save(extra?: { modelKey?: string; textureKey?: string }) {
    setError(null);
    startTransition(async () => {
      const result = await updatePublishedCosmeticItem(item.id, { name, priceFlowers, colorCustomizable, ...extra });
      if ("error" in result) setError(result.error);
      else onChanged();
    });
  }

  async function handleTextureReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const uploaded = await uploadToR2(file, file.type);
    if ("error" in uploaded) {
      setError(uploaded.error);
      return;
    }
    save({ textureKey: uploaded.key });
  }

  async function bakeThumbnail(canvas: HTMLCanvasElement) {
    const blob = await canvasToBlob(canvas);
    if (!blob) return;
    const uploaded = await uploadToR2(blob, "image/png");
    if ("error" in uploaded) return;
    await setCosmeticThumbnail(item.id, uploaded.publicUrl);
  }

  return (
    <div className="admin-cosmetic-card">
      <div className="admin-cosmetic-preview">
        <ModelPreviewToggle
          modelUrl={item.modelUrl}
          textureUrl={item.textureUrl}
          thumbnailUrl={item.thumbnailUrl}
          onFirstRender={item.thumbnailUrl ? undefined : bakeThumbnail}
        />
      </div>
      <div className="admin-cosmetic-fields">
        <p className="admin-cosmetic-source">
          {TYPE_LABEL[item.type]} · {item.nexoItemId}
        </p>
        <label className="admin-field">
          Назва
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="admin-field">
          Ціна (квітки)
          <input
            type="number"
            min={0}
            value={priceFlowers}
            onChange={(e) => setPriceFlowers(Number(e.target.value))}
          />
        </label>
        {item.type !== "FURNITURE" && (
          <label className="admin-checkbox-label">
            <input
              type="checkbox"
              checked={colorCustomizable}
              onChange={(e) => setColorCustomizable(e.target.checked)}
            />
            Можна змінювати колір (dye)
          </label>
        )}
        {error && <p className="profile-bio-error">{error}</p>}
        <div className="admin-form-actions">
          <button type="button" onClick={() => save()} disabled={pending}>
            Зберегти
          </button>
          <button type="button" onClick={() => textureInputRef.current?.click()} disabled={pending}>
            Замінити текстуру
          </button>
          <input ref={textureInputRef} type="file" accept="image/png" hidden onChange={handleTextureReplace} />
        </div>
      </div>
    </div>
  );
}

// Walks every PUBLISHED item missing a thumbnail one at a time — a hidden
// off-screen viewer mounts, renders, captures, uploads, then unmounts
// before the next one starts. Never more than one live WebGL context at
// once, unlike rendering all cards' viewers simultaneously would.
function ThumbnailBaker({ onDone }: { onDone: () => void }) {
  const [queue, setQueue] = useState<{ id: string; modelUrl: string; textureUrl: string }[] | null>(null);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);

  async function start() {
    setRunning(true);
    const items = await listCosmeticIdsMissingThumbnail();
    setQueue(items);
    setIndex(0);
    if (items.length === 0) setRunning(false);
  }

  async function handleReady(canvas: HTMLCanvasElement) {
    if (!queue) return;
    const item = queue[index];
    const blob = await canvasToBlob(canvas);
    if (blob) {
      const uploaded = await uploadToR2(blob, "image/png");
      if (!("error" in uploaded)) await setCosmeticThumbnail(item.id, uploaded.publicUrl);
    }
    if (index + 1 < queue.length) {
      setIndex(index + 1);
    } else {
      setRunning(false);
      setQueue(null);
      onDone();
    }
  }

  const current = queue?.[index];

  return (
    <div className="admin-thumbnail-baker">
      <button type="button" onClick={start} disabled={running}>
        {running ? `Запікання... (${index + 1}/${queue?.length ?? "?"})` : "Запекти всі відсутні прев'ю"}
      </button>
      {current && (
        <div className="admin-thumbnail-baker-hidden">
          <ModelViewer3D
            key={current.id}
            modelUrl={current.modelUrl}
            textureUrl={current.textureUrl}
            onReady={handleReady}
          />
        </div>
      )}
    </div>
  );
}

export default function CosmeticsAdmin({
  initialDrafts,
  initialPublished,
}: {
  initialDrafts: CosmeticItemRow[];
  initialPublished: CosmeticItemRow[];
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [published, setPublished] = useState(initialPublished);
  // Each card can mount a 3D viewer and several inputs — rendering all ~350
  // at once made the admin page sluggish, so both lists page in.
  const [draftsShown, setDraftsShown] = useState(ADMIN_PAGE_SIZE);
  const [publishedShown, setPublishedShown] = useState(ADMIN_PAGE_SIZE);
  const [mode, setMode] = useState<"single" | "pack">("single");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Single-model form fields
  const [name, setName] = useState("");
  const [type, setType] = useState<CosmeticType>("FURNITURE");
  const [colorCustomizable, setColorCustomizable] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const packInputRef = useRef<HTMLInputElement>(null);

  // A page reload is the simplest way to re-pull server lists after a
  // mutation here — this panel's own revalidatePath calls already refresh
  // the underlying data, this just re-fetches it into the client state.
  function refresh() {
    location.reload();
  }

  async function submitSingleModel() {
    const modelFile = modelInputRef.current?.files?.[0];
    const textureFile = textureInputRef.current?.files?.[0];
    if (!name.trim() || !modelFile || !textureFile) {
      setUploadError("Вкажіть назву, файл моделі (.json) і текстуру (.png)");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const [modelUpload, textureUpload] = await Promise.all([
        uploadToR2(modelFile, modelFile.type || "application/json"),
        uploadToR2(textureFile, textureFile.type || "image/png"),
      ]);
      if ("error" in modelUpload) {
        setUploadError(modelUpload.error);
        return;
      }
      if ("error" in textureUpload) {
        setUploadError(textureUpload.error);
        return;
      }
      const result = await stageSingleModel({
        name: name.trim(),
        type,
        colorCustomizable,
        modelKey: modelUpload.key,
        textureKey: textureUpload.key,
      });
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      refresh();
    } finally {
      setUploading(false);
    }
  }

  async function submitPack() {
    const packFile = packInputRef.current?.files?.[0];
    if (!packFile) {
      setUploadError("Виберіть zip-файл паку");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadToR2(packFile, packFile.type || "application/zip");
      if ("error" in uploaded) {
        setUploadError(uploaded.error);
        return;
      }
      const result = await stageUploadedPack(uploaded.key, packFile.name);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      refresh();
    } catch (err) {
      // A failed R2 PUT (network/CORS) or a server action that died (timeout)
      // rejects instead of returning { error } — show it, don't just stop.
      setUploadError(`Не вдалося завантажити пак: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-cosmetics">
      <div className="admin-cosmetics-upload">
        <div className="admin-radio-row">
          <label>
            <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} /> Одна модель
          </label>
          <label>
            <input type="radio" checked={mode === "pack"} onChange={() => setMode("pack")} /> Цілий пак (.zip)
          </label>
        </div>

        {mode === "single" ? (
          <>
            <label className="admin-field">
              Назва
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="admin-field">
              Тип
              <select value={type} onChange={(e) => setType(e.target.value as CosmeticType)}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {type !== "FURNITURE" && (
              <label className="admin-checkbox-label">
                <input type="checkbox" checked={colorCustomizable} onChange={(e) => setColorCustomizable(e.target.checked)} />
                Можна змінювати колір (dye)
              </label>
            )}
            <label className="admin-field">
              Файл моделі (.json)
              <input ref={modelInputRef} type="file" accept="application/json,.json" />
            </label>
            <label className="admin-field">
              Текстура (.png)
              <input ref={textureInputRef} type="file" accept="image/png" />
            </label>
            <div className="admin-form-actions">
              <button type="button" onClick={submitSingleModel} disabled={uploading}>
                {uploading ? "Завантаження..." : "Завантажити"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="admin-field">
              Zip-файл паку
              <input ref={packInputRef} type="file" accept=".zip" />
            </label>
            <div className="admin-form-actions">
              <button type="button" onClick={submitPack} disabled={uploading}>
                {uploading ? "Обробка..." : "Завантажити пак"}
              </button>
            </div>
          </>
        )}
        {uploadError && <p className="profile-bio-error">{uploadError}</p>}
      </div>

      <ThumbnailBaker onDone={refresh} />

      {drafts.length > 0 && (
        <>
          <h4 className="admin-gallery-photos-title">Чернетки ({drafts.length})</h4>
          <div className="admin-cosmetics-list">
            {drafts.slice(0, draftsShown).map((item) => (
              <DraftCard key={item.id} item={item} onChanged={refresh} />
            ))}
          </div>
          {draftsShown < drafts.length && (
            <button
              type="button"
              className="leaderboard-load-more"
              onClick={() => setDraftsShown((n) => n + ADMIN_PAGE_SIZE)}
            >
              Завантажити ще ({drafts.length - draftsShown})
            </button>
          )}
        </>
      )}

      <h4 className="admin-gallery-photos-title">Опубліковано ({published.length})</h4>
      {published.length === 0 ? (
        <p>Поки що нічого не опубліковано.</p>
      ) : (
        <div className="admin-cosmetics-list">
          {published.slice(0, publishedShown).map((item) => (
            <PublishedCard key={item.id} item={item} onChanged={refresh} />
          ))}
        </div>
      )}
      {publishedShown < published.length && (
        <button
          type="button"
          className="leaderboard-load-more"
          onClick={() => setPublishedShown((n) => n + ADMIN_PAGE_SIZE)}
        >
          Завантажити ще ({published.length - publishedShown})
        </button>
      )}
    </div>
  );
}
