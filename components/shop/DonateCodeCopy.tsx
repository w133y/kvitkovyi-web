"use client";

import { useState } from "react";

// Donatello's own donation page doesn't read amount/message from the URL
// (checked its client bundles — nothing there binds those fields to
// location.search), so there's no way to make the button open it
// pre-filled. This is the next best thing: the code lands in the
// clipboard the moment the button's clicked, ready to paste into
// Donatello's message field as soon as the new tab opens.
export default function DonateCodeCopy({
  code,
  amountUah,
  donatelloUrl,
}: {
  code: string;
  amountUah: number;
  donatelloUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, non-secure context) — the
      // code is still shown on the page either way, so this is best-effort.
    }
  }

  return (
    <>
      <div className="donate-payment-code">
        <span>
          Код для повідомлення до донату:
          <strong>{code}</strong>
        </span>
        <button type="button" className="donate-payment-copy" onClick={copyCode}>
          <i className={copied ? "fa-solid fa-check" : "fa-solid fa-copy"}></i>
          {copied ? "Скопійовано" : "Копіювати"}
        </button>
      </div>

      <a
        href={donatelloUrl}
        target="_blank"
        rel="noreferrer"
        className="donate-continue-btn"
        style={{ width: "auto", padding: "14px 30px", textAlign: "center" }}
        onClick={copyCode}
      >
        Задонатити {amountUah} ₴ на Donatello
      </a>
    </>
  );
}
