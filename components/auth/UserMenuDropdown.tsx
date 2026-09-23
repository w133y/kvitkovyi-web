"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PlayerAvatar from "@/components/leaderboard/PlayerAvatar";
import SignOutConfirm from "./SignOutConfirm";

export default function UserMenuDropdown({
  name,
  skinUrl,
  profileHref,
  isAdmin,
}: {
  name: string | null | undefined;
  skinUrl: string;
  profileHref: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    // Click-toggle only — no onMouseEnter/onMouseLeave. Hover has no
    // equivalent on a touch screen, which is exactly what made this menu
    // unreliable on mobile: the click handler below would toggle it open,
    // but the (non-existent) hover-out never fired to explain why it
    // sometimes seemed stuck, and on some browsers the synthetic hover a
    // touch tap fires would immediately re-close what the click just opened.
    <div className="user-menu" ref={rootRef}>
      <button type="button" className="user-pill" onClick={() => setOpen((o) => !o)}>
        <span className="nick">{name}</span>
        <span className="avatar">
          <PlayerAvatar skinUrl={skinUrl} size={42} />
        </span>
      </button>

      {/* Filled via portal by pages that want something under the pill —
          currently only /shop/cosmetics' flower balance. */}
      <div id="user-menu-extra" className="user-menu-extra"></div>

      <div className={`user-dropdown ${open ? "open" : ""}`}>
        <Link href={profileHref} onClick={() => setOpen(false)}>
          <i className="fas fa-user"></i>Профіль
        </Link>
        <Link href="/shop" onClick={() => setOpen(false)}>
          <i className="fa-solid fa-crown"></i>Донат
        </Link>
        {isAdmin && (
          <Link href="/admin" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-shield-halved"></i>Панель
          </Link>
        )}
        <div className="user-dropdown-divider"></div>
        <SignOutConfirm />
      </div>
    </div>
  );
}
