"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlayers } from "@/lib/actions/achievements";

const VISIBLE_TAGS = 20;

export default function NicknameMultiSelect({
  selected,
  onChange,
  max,
}: {
  selected: string[];
  onChange: (nicknames: string[]) => void;
  max?: number;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchPlayers(trimmed);
      if (!cancelled) setSuggestions(results.filter((n) => !selected.includes(n)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const atMax = typeof max === "number" && selected.length >= max;

  function add(nickname: string) {
    if (atMax) return;
    if (!selected.includes(nickname)) {
      onChange(max === 1 ? [nickname] : [...selected, nickname]);
    }
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function remove(nickname: string) {
    onChange(selected.filter((n) => n !== nickname));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      add(query.trim());
    } else if (e.key === "Backspace" && !query && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  return (
    <div className="nickname-multiselect" ref={containerRef}>
      <div className="nickname-multiselect-tags">
        {/* After "Усі гравці" this can be 100+ names — show the first few and
            a count rather than a wall of tags. */}
        {selected.slice(0, VISIBLE_TAGS).map((n) => (
          <span className="nickname-multiselect-tag" key={n}>
            {n}
            <button type="button" onClick={() => remove(n)} aria-label={`Прибрати ${n}`}>
              ×
            </button>
          </span>
        ))}
        {selected.length > VISIBLE_TAGS && (
          <span className="nickname-multiselect-more">+{selected.length - VISIBLE_TAGS} ще</span>
        )}
        {!atMax && (
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selected.length === 0 ? "Почніть вводити нік..." : ""}
          />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="nickname-multiselect-dropdown">
          {suggestions.map((n) => (
            <button type="button" key={n} onClick={() => add(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
