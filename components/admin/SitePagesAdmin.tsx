"use client";

import { useState, useTransition } from "react";
import { setSitePageEnabled } from "@/lib/actions/site-pages";
import { SITE_PAGES, type SitePageKey } from "@/lib/site-pages";

// Per-section switches: an off section is hidden from the menu, its /shop
// card goes inactive (sponsorship/cosmetics), and direct links 404 — for
// everyone except admins.
export default function SitePagesAdmin({ initialDisabled }: { initialDisabled: SitePageKey[] }) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: SitePageKey, enabled: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        setDisabled(await setSitePageEnabled(key, enabled));
      } catch {
        setError("Не вдалося зберегти — спробуйте ще раз");
      }
    });
  }

  return (
    <div className="admin-site-pages">
      <p className="admin-privileges-summary">
        Вимкнені вкладки зникають з меню й недоступні за посиланням для звичайних гравців. Адміни бачать усе.
      </p>
      {SITE_PAGES.map((p) => {
        const enabled = !disabled.includes(p.key);
        return (
          <label className="admin-checkbox-label" key={p.key}>
            <input type="checkbox" checked={enabled} onChange={(e) => toggle(p.key, e.target.checked)} disabled={pending} />
            {p.label} <span className="admin-site-pages-path">{p.path}</span>
            {!enabled && <span className="admin-site-pages-off">вимкнено</span>}
          </label>
        );
      })}
      {error && <p className="profile-bio-error">{error}</p>}
    </div>
  );
}
