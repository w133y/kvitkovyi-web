"use client";

import { useState, useTransition } from "react";
import { proposeSeasonChange, setSeasonLocked } from "@/lib/actions/gallery";

export default function GallerySettingsAdmin({
  currentSeason,
  pendingSeason,
  seasonLocked,
}: {
  currentSeason: number;
  pendingSeason: number | null;
  seasonLocked: boolean;
}) {
  const [season, setSeason] = useState(currentSeason);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [locked, setLocked] = useState(seasonLocked);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await proposeSeasonChange(season);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  function toggleLocked() {
    const next = !locked;
    setLocked(next);
    startTransition(async () => {
      await setSeasonLocked(next);
    });
  }

  return (
    <div className="admin-gallery-settings">
      <p className="admin-privileges-summary">Поточний сезон: {currentSeason}</p>
      {pendingSeason !== null && (
        <p className="admin-gallery-pending">
          <i className="fa-solid fa-clock"></i> Очікує підтвердження в Discord: сезон {pendingSeason}
        </p>
      )}

      <label className="admin-field">
        Новий сезон за замовчуванням
        <input type="number" min={1} value={season} onChange={(e) => setSeason(Number(e.target.value))} />
      </label>

      {error && <p className="profile-bio-error">{error}</p>}
      {sent && <p className="admin-luckperms-success">Запит надіслано в Discord — очікуйте підтвердження.</p>}

      <div className="admin-form-actions">
        <button type="button" onClick={submit} disabled={pending || season === currentSeason || pendingSeason !== null}>
          Запропонувати зміну
        </button>
      </div>

      <label className="admin-checkbox-label">
        <input type="checkbox" checked={locked} onChange={toggleLocked} disabled={pending} />
        Заблокувати вибір сезону у формі пропозиції фото
      </label>
    </div>
  );
}
