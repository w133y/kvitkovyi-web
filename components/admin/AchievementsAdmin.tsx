"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createAchievementsForPlayers,
  deleteAchievement,
  updateAchievement,
  type AchievementInput,
  listAllPlayers,
} from "@/lib/actions/achievements";
import AchievementCard from "@/components/profile/AchievementCard";
import NicknameMultiSelect from "@/components/admin/NicknameMultiSelect";
import PlayerFilters from "@/components/admin/PlayerFilters";

type Achievement = {
  id: string;
  nickname: string;
  category: string;
  iconType: string;
  icon: string;
  title: string;
  subtitle: string | null;
  borderColor: string | null;
  background: string | null;
  sortOrder: number;
};

const CATEGORY_PRESETS = ["Мер", "Спонсор", "Івент", "Старожил", "Гравець"];
const CUSTOM_CATEGORY = "__custom__";

function pluralizeCards(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "картка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "картки";
  return "карток";
}

const EMPTY_FORM = {
  nicknames: [] as string[],
  categoryPreset: CATEGORY_PRESETS[0],
  categoryCustom: "",
  iconType: "emoji" as "emoji" | "image",
  icon: "🏆",
  title: "",
  subtitle: "",
  borderEnabled: false,
  borderColor: "#FFD139",
  backgroundType: "default" as "default" | "color" | "gradient",
  bgColor: "#2d2d2d",
  gradFrom: "#2d2d2d",
  gradTo: "#5865F2",
  gradAngle: 135,
  sortOrder: 0,
};

type FormState = typeof EMPTY_FORM;

export default function AchievementsAdmin({
  initialAchievements,
}: {
  initialAchievements: Achievement[];
}) {
  const [achievements, setAchievements] = useState(initialAchievements);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Awarding a card to everyone who ever played (play_time).
  async function selectAllPlayers() {
    setLoadingPlayers(true);
    try {
      const all = await listAllPlayers();
      setForm((f) => ({ ...f, nicknames: Array.from(new Set([...f.nicknames, ...all])) }));
    } finally {
      setLoadingPlayers(false);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const [playerFilter, setPlayerFilter] = useState("");

  const players = useMemo(() => {
    const groups = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const list = groups.get(a.nickname);
      if (list) list.push(a);
      else groups.set(a.nickname, [a]);
    }
    return Array.from(groups.entries())
      .map(([nickname, items]) => ({ nickname, items }))
      .sort((x, y) => x.nickname.localeCompare(y.nickname));
  }, [achievements]);

  const filteredPlayers = useMemo(() => {
    const q = playerFilter.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.nickname.toLowerCase().includes(q));
  }, [players, playerFilter]);

  const openPlayerAchievements = openPlayer
    ? achievements.filter((a) => a.nickname === openPlayer)
    : [];

  function openPlayerView(nickname: string) {
    setOpenPlayer(nickname);
    if (!editingId) {
      setForm((f) => ({ ...f, nicknames: [nickname] }));
    }
  }

  const category =
    form.categoryPreset === CUSTOM_CATEGORY ? form.categoryCustom.trim() : form.categoryPreset;

  const background = useMemo(() => {
    if (form.backgroundType === "color") return form.bgColor;
    if (form.backgroundType === "gradient") {
      return `linear-gradient(${form.gradAngle}deg, ${form.gradFrom}, ${form.gradTo})`;
    }
    return "";
  }, [form.backgroundType, form.bgColor, form.gradFrom, form.gradTo, form.gradAngle]);

  const borderColor = form.borderEnabled ? form.borderColor : "";

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEditing(a: Achievement) {
    setEditingId(a.id);
    setError(null);

    const isPreset = CATEGORY_PRESETS.includes(a.category);
    const bg = a.background ?? "";
    const isGradient = bg.startsWith("linear-gradient(");
    let gradFrom = EMPTY_FORM.gradFrom;
    let gradTo = EMPTY_FORM.gradTo;
    let gradAngle = EMPTY_FORM.gradAngle;
    if (isGradient) {
      const match = bg.match(/linear-gradient\((-?\d+)deg,\s*(.+?),\s*(.+?)\)/);
      if (match) {
        gradAngle = Number(match[1]);
        gradFrom = match[2].trim();
        gradTo = match[3].trim();
      }
    }

    setForm({
      nicknames: [a.nickname],
      categoryPreset: isPreset ? a.category : CUSTOM_CATEGORY,
      categoryCustom: isPreset ? "" : a.category,
      iconType: a.iconType === "image" ? "image" : "emoji",
      icon: a.icon,
      title: a.title,
      subtitle: a.subtitle ?? "",
      borderEnabled: !!a.borderColor,
      borderColor: a.borderColor ?? EMPTY_FORM.borderColor,
      backgroundType: isGradient ? "gradient" : bg ? "color" : "default",
      bgColor: !isGradient && bg ? bg : EMPTY_FORM.bgColor,
      gradFrom,
      gradTo,
      gradAngle,
      sortOrder: a.sortOrder,
    });
  }

  function submit() {
    setError(null);
    if (form.nicknames.length === 0) {
      setError("Виберіть хоча б одного гравця");
      return;
    }

    const commonData = {
      category,
      iconType: form.iconType,
      icon: form.icon,
      title: form.title,
      subtitle: form.subtitle,
      borderColor,
      background,
      sortOrder: form.sortOrder,
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const data: AchievementInput = { nickname: form.nicknames[0], ...commonData };
          await updateAchievement(editingId, data);
          setAchievements((prev) =>
            prev.map((a) =>
              a.id === editingId
                ? { ...a, ...data, subtitle: data.subtitle || null, borderColor: data.borderColor || null, background: data.background || null }
                : a
            )
          );
        } else {
          await createAchievementsForPlayers(form.nicknames, commonData);
          setAchievements((prev) => [
            ...prev,
            ...form.nicknames.map((nickname) => ({
              id: `tmp-${Date.now()}-${nickname}`,
              nickname,
              ...commonData,
              subtitle: commonData.subtitle || null,
              borderColor: commonData.borderColor || null,
              background: commonData.background || null,
            })),
          ]);
        }
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не вдалося зберегти");
      }
    });
  }

  function remove(a: Achievement) {
    if (!confirm(`Видалити "${a.title}" у ${a.nickname}?`)) return;
    startTransition(async () => {
      try {
        await deleteAchievement(a.id);
        const next = achievements.filter((x) => x.id !== a.id);
        setAchievements(next);
        if (openPlayer && !next.some((x) => x.nickname === openPlayer)) {
          setOpenPlayer(null);
        }
        if (editingId === a.id) resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не вдалося видалити");
      }
    });
  }

  return (
    <div className="admin-achievements">
      <div className="admin-achievements-form">
        <div className="admin-form-fields">
          <label className="admin-field">
            <span className="admin-field-head">
              {editingId ? "Гравець" : "Гравці"}
              {!editingId && (
                <span className="admin-field-head-actions">
                  <button type="button" onClick={selectAllPlayers} disabled={loadingPlayers}>
                    {loadingPlayers ? "Завантаження..." : "Усі гравці"}
                  </button>
                  {form.nicknames.length > 0 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, nicknames: [] }))}>
                      Очистити
                    </button>
                  )}
                </span>
              )}
            </span>
            <NicknameMultiSelect
              selected={form.nicknames}
              onChange={(nicknames) => setForm((f) => ({ ...f, nicknames }))}
              max={editingId ? 1 : undefined}
            />
          </label>

          {!editingId && (
            <PlayerFilters
              card={{ category, title: form.title }}
              onSelect={(found, mode) =>
                setForm((f) => ({
                  ...f,
                  nicknames: mode === "replace" ? found : Array.from(new Set([...f.nicknames, ...found])),
                }))
              }
            />
          )}

          <label className="admin-field">
            Категорія
            <select
              value={form.categoryPreset}
              onChange={(e) => setForm((f) => ({ ...f, categoryPreset: e.target.value }))}
            >
              {CATEGORY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY}>Інше...</option>
            </select>
          </label>

          {form.categoryPreset === CUSTOM_CATEGORY && (
            <label className="admin-field">
              Своя категорія
              <input
                type="text"
                value={form.categoryCustom}
                onChange={(e) => setForm((f) => ({ ...f, categoryCustom: e.target.value }))}
                placeholder="Наприклад: Будівничий"
              />
            </label>
          )}

          <label className="admin-field">
            Тип іконки
            <div className="admin-radio-row">
              <label>
                <input
                  type="radio"
                  checked={form.iconType === "emoji"}
                  onChange={() => setForm((f) => ({ ...f, iconType: "emoji" }))}
                />
                Емодзі
              </label>
              <label>
                <input
                  type="radio"
                  checked={form.iconType === "image"}
                  onChange={() => setForm((f) => ({ ...f, iconType: "image" }))}
                />
                Картинка (URL)
              </label>
            </div>
          </label>

          <label className="admin-field">
            {form.iconType === "image" ? "Посилання на іконку" : "Емодзі"}
            <input
              type="text"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder={form.iconType === "image" ? "https://..." : "🏆"}
            />
          </label>

          <label className="admin-field">
            Заголовок
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Місто Квітів"
            />
          </label>

          <label className="admin-field">
            Підзаголовок (необов&apos;язково)
            <input
              type="text"
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              placeholder="Сезон 2"
            />
          </label>

          <label className="admin-field">
            <span className="admin-checkbox-label">
              <input
                type="checkbox"
                checked={form.borderEnabled}
                onChange={(e) => setForm((f) => ({ ...f, borderEnabled: e.target.checked }))}
              />
              Обводка
            </span>
            {form.borderEnabled && (
              <input
                type="color"
                value={form.borderColor}
                onChange={(e) => setForm((f) => ({ ...f, borderColor: e.target.value }))}
              />
            )}
          </label>

          <label className="admin-field">
            Фон картки
            <select
              value={form.backgroundType}
              onChange={(e) =>
                setForm((f) => ({ ...f, backgroundType: e.target.value as FormState["backgroundType"] }))
              }
            >
              <option value="default">Стандартний</option>
              <option value="color">Колір</option>
              <option value="gradient">Градієнт</option>
            </select>
          </label>

          {form.backgroundType === "color" && (
            <label className="admin-field">
              Колір фону
              <input
                type="color"
                value={form.bgColor}
                onChange={(e) => setForm((f) => ({ ...f, bgColor: e.target.value }))}
              />
            </label>
          )}

          {form.backgroundType === "gradient" && (
            <label className="admin-field">
              Градієнт
              <div className="admin-radio-row">
                <input
                  type="color"
                  value={form.gradFrom}
                  onChange={(e) => setForm((f) => ({ ...f, gradFrom: e.target.value }))}
                />
                <input
                  type="color"
                  value={form.gradTo}
                  onChange={(e) => setForm((f) => ({ ...f, gradTo: e.target.value }))}
                />
                <input
                  type="number"
                  value={form.gradAngle}
                  onChange={(e) => setForm((f) => ({ ...f, gradAngle: Number(e.target.value) }))}
                  min={0}
                  max={360}
                  style={{ width: 70 }}
                />
                <span>°</span>
              </div>
            </label>
          )}

          <label className="admin-field">
            Порядок сортування
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </label>

          {error && <p className="profile-bio-error">{error}</p>}

          <div className="admin-form-actions">
            {editingId && (
              <button type="button" onClick={resetForm} disabled={pending}>
                Скасувати
              </button>
            )}
            <button type="button" onClick={submit} disabled={pending}>
              {editingId
                ? "Зберегти"
                : form.nicknames.length > 1
                  ? `Додати (${form.nicknames.length})`
                  : "Додати"}
            </button>
          </div>
        </div>

        <div className="admin-form-preview">
          <p className="admin-form-preview-label">Попередній перегляд</p>
          <div className="achievement-card-preview-wrap">
            <AchievementCard
              category={category || "Категорія"}
              iconType={form.iconType}
              icon={form.icon}
              title={form.title || "Заголовок"}
              subtitle={form.subtitle}
              borderColor={borderColor}
              background={background}
            />
          </div>
        </div>
      </div>

      <div className="admin-achievements-list">
        {!openPlayer && (
          <>
            {players.length === 0 ? (
              <p>Досягнень ще немає.</p>
            ) : (
              <>
                <input
                  type="text"
                  className="admin-player-search"
                  value={playerFilter}
                  onChange={(e) => setPlayerFilter(e.target.value)}
                  placeholder="Пошук гравця..."
                />
                {filteredPlayers.length === 0 && <p>Гравців не знайдено.</p>}
                {filteredPlayers.map(({ nickname, items }) => (
                  <button
                    type="button"
                    className="admin-player-row"
                    key={nickname}
                    onClick={() => openPlayerView(nickname)}
                  >
                    <b>{nickname}</b>
                    <span>
                      {items.length} {pluralizeCards(items.length)}
                    </span>
                  </button>
                ))}
              </>
            )}
          </>
        )}

        {openPlayer && (
          <>
            <div className="admin-player-header">
              <button type="button" onClick={() => setOpenPlayer(null)}>
                ← Усі гравці
              </button>
              <h4>{openPlayer}</h4>
            </div>
            {openPlayerAchievements.map((a) => (
              <div className="admin-achievements-row" key={a.id}>
                <div className="achievement-card-preview-wrap achievement-card-preview-wrap-sm">
                  <AchievementCard
                    category={a.category}
                    iconType={a.iconType}
                    icon={a.icon}
                    title={a.title}
                    subtitle={a.subtitle}
                    borderColor={a.borderColor}
                    background={a.background}
                  />
                </div>
                <div className="admin-achievements-row-info">
                  <b>{a.nickname}</b>
                  <span>
                    {a.category} — {a.title}
                    {a.subtitle ? ` (${a.subtitle})` : ""}
                  </span>
                </div>
                <div className="admin-achievements-row-actions">
                  <button type="button" onClick={() => startEditing(a)} disabled={pending}>
                    Редагувати
                  </button>
                  <button type="button" onClick={() => remove(a)} disabled={pending}>
                    Видалити
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
