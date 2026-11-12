"use client";

import { useState, useTransition } from "react";
import { setSeasonLocked } from "@/lib/actions/gallery";

// The season itself is changed in the "Сезон" section (SeasonAdmin).
export default function GallerySettingsAdmin({ seasonLocked }: { seasonLocked: boolean }) {
  const [locked, setLocked] = useState(seasonLocked);
  const [pending, startTransition] = useTransition();

  function toggleLocked() {
    const next = !locked;
    setLocked(next);
    startTransition(async () => {
      await setSeasonLocked(next);
    });
  }

  return (
    <div className="admin-gallery-settings">
      <label className="admin-checkbox-label">
        <input type="checkbox" checked={locked} onChange={toggleLocked} disabled={pending} />
        Заблокувати вибір сезону у формі пропозиції фото
      </label>
    </div>
  );
}
