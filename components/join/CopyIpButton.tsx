"use client";

import { useState } from "react";

const SERVER_IP = "mc.kvitkovyii.pp.ua";

type CopyState = "idle" | "copied" | "error";

export default function CopyIpButton() {
  const [state, setState] = useState<CopyState>("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SERVER_IP);
      setState("copied");
    } catch (err) {
      console.error("Помилка копіювання:", err);
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 2000);
    }
  };

  return (
    <button className="copy-button" type="button" onClick={handleCopy}>
      <span className="button-text">
        {state === "idle" && (
          <>
            <i className="fas fa-copy"></i>Копіювати IP
          </>
        )}
        {state === "copied" && (
          <>
            <i className="fas fa-check"></i>Скопійовано
          </>
        )}
        {state === "error" && (
          <>
            <i className="fas fa-times"></i>Помилка
          </>
        )}
      </span>
    </button>
  );
}
