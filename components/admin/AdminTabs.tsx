"use client";

import { useEffect, useState, type ReactNode } from "react";

// The admin page's sections, grouped. Every panel stays mounted (just hidden)
// so switching tabs never loses half-filled forms; the open tab is kept in the
// URL hash, so a reload or a shared link lands on it.
export default function AdminTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (tabs.some((t) => t.id === fromHash)) setActive(fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="admin-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            onClick={() => {
              setActive(t.id);
              history.replaceState(null, "", `#${t.id}`);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" className="admin-tab-panel" hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </>
  );
}
