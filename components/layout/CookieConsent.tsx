"use client";

// Cookie consent. The site's own cookies (sign-in session) are strictly
// necessary and need no consent; the only optional one is the Google Ads tag,
// which now loads ONLY after "Прийняти". The choice is remembered in
// localStorage and can be changed from /privacy (the "Налаштування кукі"
// button dispatches the event below).

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import Link from "next/link";

const STORAGE_KEY = "kv-cookie-consent";
const GOOGLE_TAG_ID = "AW-17089484935";
export const REOPEN_CONSENT_EVENT = "kv-cookie-consent:reopen";

type Choice = "accepted" | "rejected";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

const CHANGE_EVENT = "kv-cookie-consent:change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// /privacy → reopens the banner so the choice can be changed.
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="cookie-settings-btn"
      onClick={() => window.dispatchEvent(new Event(REOPEN_CONSENT_EVENT))}
    >
      Налаштування кукі
    </button>
  );
}

export default function CookieConsent() {
  // undefined on the server / first paint — render nothing, so the banner
  // never flashes for someone who already chose.
  const stored = useSyncExternalStore<Choice | null | undefined>(subscribe, readChoice, () => undefined);
  // "Налаштування кукі" on /privacy shows the banner again without forgetting
  // the current choice (the tag keeps running until they actually decline).
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(REOPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_CONSENT_EVENT, reopen);
  }, []);

  function decide(next: Choice) {
    const previous = readChoice();
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked — the choice just won't persist across visits.
    }
    // Withdrawing consent after the tag already ran: a reload is the only
    // way to unload it.
    if (previous === "accepted" && next === "rejected") {
      window.location.reload();
      return;
    }
    setReopened(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const tagLoaded = stored === "accepted";
  const showBanner = stored === null || (stored !== undefined && reopened);

  return (
    <>
      {tagLoaded && (
        <>
          <Script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`} />
          <Script id="gtag-init">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_TAG_ID}');`}
          </Script>
        </>
      )}

      {showBanner && (
        <div className="cookie-banner" role="dialog" aria-label="Кукі">
          <p>
            🍪 Ми використовуємо необхідні кукі для входу на сайт. З вашого дозволу — ще й рекламний тег Google, щоб
            рахувати, звідки приходять гравці. Детальніше — у{" "}
            <Link href="/privacy#cookies">політиці конфіденційності</Link>.
          </p>
          <div className="cookie-banner-actions">
            <button type="button" onClick={() => decide("rejected")}>
              Лише необхідні
            </button>
            <button type="button" className="cookie-accept" onClick={() => decide("accepted")}>
              Прийняти
            </button>
          </div>
        </div>
      )}
    </>
  );
}
