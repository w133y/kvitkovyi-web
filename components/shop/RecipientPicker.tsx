"use client";

import { useEffect, useRef, useState } from "react";
import { searchDonateRecipients } from "@/lib/actions/donate-order";

// Lets a buyer gift the privilege to a different player than themselves —
// sits between the info button and "Продовжити" in DonateBuilder. Search
// reuses the same public nickname lookup the site already exposes
// elsewhere (leaderboard, profile pages), just scoped to signed-in users.
export default function RecipientPicker({
  myNickname,
  recipient,
  onChange,
}: {
  myNickname: string;
  recipient: string;
  onChange: (nickname: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchDonateRecipients(trimmed);
      if (!cancelled) setSuggestions(results);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(nickname: string) {
    onChange(nickname);
    setEditing(false);
    setQuery("");
    setSuggestions([]);
  }

  const isGift = recipient.toLowerCase() !== myNickname.toLowerCase();

  return (
    <div className="donate-recipient" ref={containerRef}>
      {editing ? (
        <div className="donate-recipient-search">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Нік гравця..."
          />
          {suggestions.length > 0 && (
            <div className="donate-recipient-dropdown">
              {suggestions.map((n) => (
                <button type="button" key={n} onClick={() => pick(n)}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="donate-recipient-toggle" onClick={() => setEditing(true)}>
          <i className="fa-solid fa-gift"></i>
          <span>{isGift ? `Подарунок для ${recipient}` : "Подарувати другу"}</span>
          <i className="fa-solid fa-chevron-down"></i>
        </button>
      )}
      {isGift && !editing && (
        <button type="button" className="donate-recipient-clear" onClick={() => onChange(myNickname)}>
          Скасувати
        </button>
      )}
    </div>
  );
}
