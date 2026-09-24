"use client";

import { useState, useTransition } from "react";
import { deleteAllMapMarkers } from "@/lib/actions/map-markers";

// Bulk cleanup of player-suggested BlueMap markers — two-step confirm since
// it can't be undone.
export default function MapMarkersAdmin({
  initialCounts,
}: {
  initialCounts: { approved: number; pending: number; rejected: number };
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = counts.approved + counts.pending + counts.rejected;

  function deleteAll() {
    startTransition(async () => {
      const removed = await deleteAllMapMarkers();
      setCounts({ approved: 0, pending: 0, rejected: 0 });
      setConfirming(false);
      setMessage(`Видалено міток: ${removed}. З мапи вони зникнуть протягом ~30 секунд.`);
    });
  }

  return (
    <div className="admin-gallery-settings">
      <p className="admin-privileges-summary">
        На мапі: {counts.approved} · на перевірці: {counts.pending} · відхилені: {counts.rejected}
      </p>
      {message && <p className="admin-luckperms-success">{message}</p>}
      <div className="admin-form-actions">
        {!confirming ? (
          <button type="button" className="admin-danger-btn" onClick={() => setConfirming(true)} disabled={total === 0}>
            Видалити всі мітки
          </button>
        ) : (
          <>
            <button type="button" className="admin-danger-btn" onClick={deleteAll} disabled={pending}>
              {pending ? "Видаляємо..." : `Так, видалити всі ${total}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
              Скасувати
            </button>
          </>
        )}
      </div>
    </div>
  );
}
