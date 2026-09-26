"use client";

import { useState, useTransition } from "react";
import { deleteAccountAsAdmin } from "@/lib/actions/account";

// For data-deletion requests that arrive outside the site (Discord, e-mail).
export default function AccountDeletionAdmin() {
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await deleteAccountAsAdmin(value);
      setMessage("error" in result ? { ok: false, text: result.error } : { ok: true, text: result.ok });
      setConfirming(false);
      if (!("error" in result)) setValue("");
    });
  }

  return (
    <div className="admin-gallery-settings">
      <p className="admin-privileges-summary">
        Запит на видалення даних (див. /privacy): вкажіть Discord ID або нік у грі. Покупки лишаються для обліку, але без
        особистих даних.
      </p>
      <label className="admin-field">
        Discord ID або нік
        <input value={value} onChange={(e) => { setValue(e.target.value); setConfirming(false); }} />
      </label>
      {message && <p className={message.ok ? "admin-luckperms-success" : "profile-bio-error"}>{message.text}</p>}
      <div className="admin-form-actions">
        {!confirming ? (
          <button type="button" className="admin-danger-btn" onClick={() => setConfirming(true)} disabled={!value.trim()}>
            Видалити дані акаунта
          </button>
        ) : (
          <>
            <button type="button" className="admin-danger-btn" onClick={run} disabled={pending}>
              {pending ? "Видаляємо..." : `Так, видалити (${value.trim()})`}
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
