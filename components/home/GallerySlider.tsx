"use client";

import { useState } from "react";
import Link from "next/link";
import { getGalleryUploadTarget, finalizeGalleryPhotoSubmission } from "@/lib/actions/gallery";

type Photo = { id: string; url: string; description: string | null; author: string | null };

export default function GallerySlider({
  photos,
  defaultSeason,
  seasonLocked,
}: {
  photos: Photo[];
  defaultSeason: number;
  seasonLocked: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function goTo(next: number) {
    setPrevIndex(current);
    setCurrent(next);
  }

  const nextSlide = () => goTo((current + 1) % photos.length);
  const prevSlide = () => goTo((current - 1 + photos.length) % photos.length);
  const active = photos[current];

  return (
    <div className="slider-container">
      <div className="slider-wrapper">
        <div className="slider">
          {photos.map((photo, i) => {
            if (i !== current && i !== prevIndex) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                className={`slide ${i === current ? "active" : ""}`}
                alt={`Фото галереї ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
              />
            );
          })}

          {(active.author || active.description) && (
            <div className="slide-caption">
              {active.description && <div className="slide-caption-desc">{active.description}</div>}
              {active.author && <div className="slide-caption-author">Фото: {active.author}</div>}
            </div>
          )}
        </div>

        {/* Opens over the currently-shown gallery photo (a lightbox, not a
            block pushing the rest of the page down) — the × here is the
            only close control besides the toggle button below. */}
        {formOpen && (
          <div className="gallery-submit-overlay">
            <button
              type="button"
              className="gallery-submit-close"
              onClick={() => setFormOpen(false)}
              aria-label="Закрити"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
            <SubmitForm defaultSeason={defaultSeason} seasonLocked={seasonLocked} onDone={() => setFormOpen(false)} />
          </div>
        )}
      </div>

      {/* One row, one level, one design (matches .lb-full-link's "Повний
          рейтинг" pill) — prev/next and the two page actions used to be
          two separate rows with two different button styles. */}
      <div className="gallery-controls-row">
        <button type="button" className="gallery-pill-btn gallery-arrow-btn" onClick={prevSlide} aria-label="Попереднє фото">
          <svg viewBox="0 0 24 24">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
        <button type="button" className="gallery-pill-btn gallery-arrow-btn" onClick={nextSlide} aria-label="Наступне фото">
          <svg viewBox="0 0 24 24">
            <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        </button>
        <button type="button" className="gallery-pill-btn" onClick={() => setFormOpen((v) => !v)}>
          <i className="fa-solid fa-camera"></i>
          <span>{formOpen ? "Приховати форму" : "Запропонувати фото"}</span>
        </button>
        <Link href="/gallery" className="gallery-pill-btn">
          <i className="fa-solid fa-table-cells-large"></i>
          <span>Уся галерея</span>
        </Link>
      </div>
    </div>
  );
}

function SubmitForm({
  defaultSeason,
  seasonLocked,
  onDone,
}: {
  defaultSeason: number;
  seasonLocked: boolean;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const file = formData.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        setError("Оберіть фото");
        return;
      }

      // Step 1: a presigned URL to PUT straight to R2 from the browser —
      // the file itself never goes through our own server, which is what
      // used to hit Vercel's 4.5MB serverless request-body ceiling (a
      // platform limit, not something our own config could raise).
      const target = await getGalleryUploadTarget(file.type);
      if ("error" in target) {
        setError(target.error);
        return;
      }

      const uploadRes = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setError("Не вдалося завантажити фото — спробуйте ще раз");
        return;
      }

      // Step 2: a small JSON call to actually record the submission and
      // post it for moderation, now that the photo has a URL.
      const result = await finalizeGalleryPhotoSubmission({
        url: target.publicUrl,
        key: target.key,
        description: (formData.get("description") as string) || undefined,
        season: seasonLocked ? undefined : Number(formData.get("season")) || undefined,
        author: (formData.get("author") as string) || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setTimeout(onDone, 2000);
    } catch (err) {
      // Anything unexpected throwing used to leave the button stuck on
      // "Надсилання..." forever, since nothing after an unguarded await
      // ever ran.
      console.error("gallery submit failed", err);
      setError("Не вдалося надіслати фото — спробуйте ще раз");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="gallery-submit-form gallery-submit-success">
        <i className="fa-solid fa-circle-check"></i>
        Дякуємо! Фото надіслано на модерацію.
      </div>
    );
  }

  return (
    <form className="gallery-submit-form" onSubmit={handleSubmit}>
      <label className="gallery-submit-field">
        Фото (до 10 МБ)
        <input type="file" name="photo" accept="image/*" required />
      </label>
      <label className="gallery-submit-field">
        Опис (необов&apos;язково)
        <input type="text" name="description" maxLength={200} placeholder="Коротко про фото..." />
      </label>
      <div className="gallery-submit-row">
        <label className="gallery-submit-field">
          Сезон
          <input
            type="number"
            name="season"
            min={1}
            defaultValue={defaultSeason}
            disabled={seasonLocked}
            readOnly={seasonLocked}
          />
          {seasonLocked && <span className="gallery-submit-locked-hint">Вибір сезону заблоковано адміністратором</span>}
        </label>
        <label className="gallery-submit-field">
          Автор (необов&apos;язково)
          <input type="text" name="author" maxLength={40} placeholder="Ваш нік..." />
        </label>
      </div>
      {error && <p className="gallery-submit-error">{error}</p>}
      <button type="submit" className="gallery-submit-btn" disabled={submitting}>
        {submitting ? "Надсилання..." : "Надіслати на модерацію"}
      </button>
      <p className="gallery-submit-hint">Не більше 3 фото на день. Заявка з'явиться в галереї після перевірки.</p>
    </form>
  );
}
