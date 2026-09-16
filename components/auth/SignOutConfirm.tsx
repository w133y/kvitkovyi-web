"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { signOutAction } from "@/lib/actions/auth";

export default function SignOutConfirm() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button type="button" className="dropdown-signout" onClick={() => setOpen(true)}>
        <i className="fas fa-right-from-bracket"></i>Вийти
      </button>

      {open && mounted &&
        createPortal(
          <div className="signout-modal-backdrop" onClick={() => setOpen(false)}>
            <div className="signout-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Вийти з акаунту?</h3>
              <p>Тобі знадобиться знову увійти через Discord, щоб повернутись до профілю.</p>
              <div className="signout-modal-actions">
                <button
                  type="button"
                  className="signout-cancel"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  className="signout-confirm"
                  disabled={isPending}
                  onClick={() => startTransition(() => signOutAction())}
                >
                  {isPending ? "Виходимо..." : "Так, вийти"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
