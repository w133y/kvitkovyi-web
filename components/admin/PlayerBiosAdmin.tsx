"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { clearPlayerBio } from "@/lib/actions/profile";

// Every player bio on the site, newest first, with a one-click clear.
export default function PlayerBiosAdmin({ initialBios }: { initialBios: { nickname: string; bio: string }[] }) {
  const [bios, setBios] = useState(initialBios);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  function clear(nickname: string) {
    startTransition(async () => {
      await clearPlayerBio(nickname);
      setBios((list) => list.filter((b) => b.nickname !== nickname));
    });
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? bios.filter((b) => b.nickname.toLowerCase().includes(q) || b.bio.toLowerCase().includes(q)) : bios;

  return (
    <div className="admin-bios">
      <p className="admin-privileges-summary">Описів на сайті: {bios.length}</p>
      {bios.length > 0 && (
        <input
          className="admin-bios-search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Пошук за ніком або текстом…"
        />
      )}
      {shown.map((b) => (
        <div className="admin-bios-row" key={b.nickname}>
          <div className="admin-bios-text">
            <Link href={`/profile/${b.nickname}`} target="_blank">
              {b.nickname}
            </Link>
            <span>{b.bio}</span>
          </div>
          <button type="button" className="admin-danger-btn" onClick={() => clear(b.nickname)} disabled={pending}>
            Очистити
          </button>
        </div>
      ))}
    </div>
  );
}
