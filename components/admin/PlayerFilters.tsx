"use client";

import { useState, useTransition } from "react";
import { filterPlayers, type PlayerFilter } from "@/lib/actions/achievements";

const PRIVILEGE_OPTIONS: { value: NonNullable<PlayerFilter["privilege"]>; label: string }[] = [
  { value: "all", label: "Не важливо" },
  { value: "any", label: "Є будь-яка" },
  { value: "FLORIST", label: "Флорист" },
  { value: "MECENAT", label: "Меценат" },
  { value: "none", label: "Немає" },
];

const EMPTY = {
  minHours: "",
  maxHours: "",
  excludeAfk: false,
  activeWithinDays: "",
  firstJoinFrom: "",
  firstJoinTo: "",
  minVotes: "",
  withDiscord: false,
  privilege: "all" as NonNullable<PlayerFilter["privilege"]>,
  skipOwners: true,
};

// Collapsible "Фільтри гравців" for the card-award form: find players by
// playtime, activity, first join, votes, Discord link, privilege — and skip
// those who already own the card being made.
export default function PlayerFilters({
  card,
  onSelect,
}: {
  card: { category: string; title: string };
  onSelect: (nicknames: string[], mode: "replace" | "add") => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [found, setFound] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const field = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  function search() {
    startTransition(async () => {
      setFound(
        await filterPlayers({
          minHours: num(f.minHours),
          maxHours: num(f.maxHours),
          excludeAfk: f.excludeAfk,
          activeWithinDays: num(f.activeWithinDays),
          firstJoinFrom: f.firstJoinFrom || null,
          firstJoinTo: f.firstJoinTo || null,
          minVotes: num(f.minVotes),
          withDiscord: f.withDiscord,
          privilege: f.privilege,
          excludeCard: f.skipOwners ? card : null,
        })
      );
    });
  }

  if (!open) {
    return (
      <button type="button" className="player-filters-toggle" onClick={() => setOpen(true)}>
        <i className="fa-solid fa-filter" aria-hidden="true"></i> Фільтри гравців
      </button>
    );
  }

  return (
    <div className="player-filters">
      <div className="player-filters-grid">
        <label>
          Час гри від, год
          <input type="number" min={0} value={f.minHours} onChange={field("minHours")} />
        </label>
        <label>
          до, год
          <input type="number" min={0} value={f.maxHours} onChange={field("maxHours")} />
        </label>
        <label>
          Заходив за останні, днів
          <input type="number" min={1} value={f.activeWithinDays} onChange={field("activeWithinDays")} />
        </label>
        <label>
          Мін. голосів
          <input type="number" min={0} value={f.minVotes} onChange={field("minVotes")} />
        </label>
        <label>
          Перший вхід з
          <input type="date" value={f.firstJoinFrom} onChange={field("firstJoinFrom")} />
        </label>
        <label>
          по
          <input type="date" value={f.firstJoinTo} onChange={field("firstJoinTo")} />
        </label>
        <label>
          Привілегія
          <select value={f.privilege} onChange={field("privilege")}>
            {PRIVILEGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="player-filters-checks">
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={f.excludeAfk} onChange={field("excludeAfk")} />
          Не рахувати AFK-час
        </label>
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={f.withDiscord} onChange={field("withDiscord")} />
          Лише з прив&apos;язаним Discord
        </label>
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={f.skipOwners} onChange={field("skipOwners")} />
          Пропустити тих, хто вже має цю картку (та сама категорія й заголовок)
        </label>
      </div>

      <div className="player-filters-actions">
        <button type="button" onClick={search} disabled={pending}>
          {pending ? "Шукаємо..." : "Знайти"}
        </button>
        <button type="button" onClick={() => { setF(EMPTY); setFound(null); }}>
          Скинути
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Згорнути
        </button>
      </div>

      {found && (
        <div className="player-filters-result">
          <p>
            Знайдено гравців: <b>{found.length}</b>
            {found.length > 0 && <span className="player-filters-preview"> — {found.slice(0, 12).join(", ")}{found.length > 12 ? "…" : ""}</span>}
          </p>
          {found.length > 0 && (
            <div className="player-filters-actions">
              <button type="button" onClick={() => onSelect(found, "replace")}>
                Вибрати лише їх
              </button>
              <button type="button" onClick={() => onSelect(found, "add")}>
                Додати до вибраних
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
