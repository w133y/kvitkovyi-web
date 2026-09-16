"use client";

import { useEffect } from "react";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Profile page error:", error);
  }, [error]);

  return (
    <div className="box">
      <div className="boxtext">
        <h2>
          <b>Не вдалося завантажити профіль</b>
        </h2>
        <p>Сталася тимчасова помилка. Спробуйте ще раз.</p>
        <button type="button" onClick={() => reset()} className="custom-button">
          Спробувати ще раз
        </button>
      </div>
    </div>
  );
}
