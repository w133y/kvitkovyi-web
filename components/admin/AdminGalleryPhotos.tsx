"use client";

import { useState } from "react";
import type { GalleryPhoto } from "@prisma/client";
import { updateGalleryPhoto } from "@/lib/actions/gallery";

type Draft = {
  season: number;
  description: string;
  author: string;
  showDescription: boolean;
  showAuthor: boolean;
  visible: boolean;
};

function toDraft(photo: GalleryPhoto): Draft {
  return {
    season: photo.season,
    description: photo.description ?? "",
    author: photo.author ?? "",
    showDescription: photo.showDescription,
    showAuthor: photo.showAuthor,
    visible: photo.status === "APPROVED",
  };
}

function Row({ photo }: { photo: GalleryPhoto }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(photo));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateGalleryPhoto(photo.id, {
      season: draft.season,
      description: draft.description,
      author: draft.author,
      showDescription: draft.showDescription,
      showAuthor: draft.showAuthor,
      visible: draft.visible,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="admin-gallery-photo-row">
      <button
        type="button"
        className="admin-gallery-photo-thumb"
        onClick={() => setFullscreen(true)}
        aria-label="Відкрити фото на весь екран"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" />
      </button>

      {fullscreen && (
        <div className="gallery-lightbox" onClick={() => setFullscreen(false)}>
          <button
            type="button"
            className="gallery-lightbox-close"
            onClick={() => setFullscreen(false)}
            aria-label="Закрити"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="gallery-lightbox-image" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <div className="admin-gallery-photo-fields">
        <label className="admin-field">
          Опис
          {/* A single-line input clipped/scrolled the text sideways once it
              got anywhere near the 200-char limit, so most of what was
              actually typed stayed invisible while editing. */}
          <textarea
            maxLength={200}
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>

        <div className="admin-radio-row">
          <label className="admin-field" style={{ maxWidth: 140 }}>
            Сезон
            {/* Plain +/- buttons instead of the native number spinner — its
                arrows are a few px wide and unreliable to hit precisely,
                especially this close to the enlarged thumbnail. */}
            <div className="admin-gallery-season-stepper">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, season: Math.max(1, d.season - 1) }))}
                aria-label="Зменшити сезон"
              >
                <i className="fa-solid fa-minus"></i>
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={draft.season}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, ""));
                  setDraft((d) => ({ ...d, season: Number.isFinite(n) && n > 0 ? n : d.season }));
                }}
              />
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, season: d.season + 1 }))}
                aria-label="Збільшити сезон"
              >
                <i className="fa-solid fa-plus"></i>
              </button>
            </div>
          </label>
          <label className="admin-field" style={{ flex: 1 }}>
            Автор
            <input
              type="text"
              maxLength={40}
              value={draft.author}
              onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
            />
          </label>
        </div>

        <div className="admin-radio-row">
          <label className="admin-checkbox-label">
            <input
              type="checkbox"
              checked={draft.showDescription}
              onChange={(e) => setDraft((d) => ({ ...d, showDescription: e.target.checked }))}
            />
            Показувати опис
          </label>
          <label className="admin-checkbox-label">
            <input
              type="checkbox"
              checked={draft.showAuthor}
              onChange={(e) => setDraft((d) => ({ ...d, showAuthor: e.target.checked }))}
            />
            Показувати автора
          </label>
          <label className="admin-checkbox-label">
            <input
              type="checkbox"
              checked={draft.visible}
              onChange={(e) => setDraft((d) => ({ ...d, visible: e.target.checked }))}
            />
            Видиме в галереї
          </label>
        </div>

        {error && <p className="profile-bio-error">{error}</p>}

        <div className="admin-form-actions">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Збереження..." : saved ? "Збережено ✓" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGalleryPhotos({ initialPhotos }: { initialPhotos: GalleryPhoto[] }) {
  if (initialPhotos.length === 0) {
    return <p className="admin-privileges-summary">Ще немає доданих фото.</p>;
  }

  return (
    <div className="admin-gallery-photos">
      {initialPhotos.map((photo) => (
        <Row key={photo.id} photo={photo} />
      ))}
    </div>
  );
}
