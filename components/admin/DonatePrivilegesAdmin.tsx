"use client";

import { useState, useTransition } from "react";
import {
  grantPrivilege,
  revokePrivilege,
} from "@/lib/actions/donate-privileges";
import NicknameMultiSelect from "@/components/admin/NicknameMultiSelect";
import {
  MINECRAFT_SYMBOLS,
  MINECRAFT_COLORS,
  FLORIST_SYMBOL,
  FLORIST_COLOR_HEX,
} from "@/lib/minecraft-symbols";

type Tier = "FLORIST" | "MECENAT";

type Privilege = {
  id: string;
  nickname: string;
  tier: Tier;
  iconSymbol: string | null;
  iconColorHex: string | null;
  expiresAt: string | Date;
};

function isActive(expiresAt: string | Date) {
  return new Date(expiresAt).getTime() > Date.now();
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRemaining(expiresAt: string | Date): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0 хв.";

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} дн. ${hours} год.`;

  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} год. ${minutes} хв.`;

  return `${minutes} хв.`;
}

export default function DonatePrivilegesAdmin({
  initialPrivileges,
}: {
  initialPrivileges: Privilege[];
}) {
  const [privileges, setPrivileges] = useState(initialPrivileges);
  const [nicknames, setNicknames] = useState<string[]>([]);
  const [tier, setTier] = useState<Tier>("FLORIST");
  const [symbol, setSymbol] = useState(MINECRAFT_SYMBOLS[0].char);
  const [colorHex, setColorHex] = useState(MINECRAFT_COLORS[14].hex);
  const [durationDays, setDurationDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const nickname = nicknames[0];
    if (!nickname) {
      setError("Виберіть гравця");
      return;
    }

    startTransition(async () => {
      try {
        const result = await grantPrivilege({ nickname, tier, iconSymbol: symbol, iconColorHex: colorHex, durationDays });
        setPrivileges((prev) => [
          {
            id: result.id,
            nickname,
            tier,
            iconSymbol: tier === "MECENAT" ? symbol : null,
            iconColorHex: tier === "MECENAT" ? colorHex : null,
            expiresAt: new Date(Date.now() + durationDays * 86400000),
          },
          ...prev,
        ]);
        setNicknames([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не вдалося видати привілегію");
      }
    });
  }

  function remove(p: Privilege) {
    if (!confirm(`Забрати привілегію "${p.tier}" у ${p.nickname}?`)) return;
    startTransition(async () => {
      try {
        await revokePrivilege(p.id);
        setPrivileges((prev) => prev.filter((x) => x.id !== p.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не вдалося забрати привілегію");
      }
    });
  }

  const activeCount = privileges.filter((p) => isActive(p.expiresAt)).length;

  return (
    <div className="admin-privileges">
      <div className="admin-privileges-form">
        <label className="admin-field">
          Гравець
          <NicknameMultiSelect selected={nicknames} onChange={setNicknames} max={1} />
        </label>

        <label className="admin-field">
          Привілегія
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            <option value="FLORIST">Флорист</option>
            <option value="MECENAT">Меценат</option>
          </select>
        </label>

        {tier === "MECENAT" && (
          <>
            <label className="admin-field">
              Символ
              <div className="admin-symbol-grid">
                {MINECRAFT_SYMBOLS.map((s) => (
                  <button
                    type="button"
                    key={s.char}
                    className={"admin-symbol-btn" + (symbol === s.char ? " active" : "")}
                    title={s.label}
                    onClick={() => setSymbol(s.char)}
                  >
                    {s.char}
                  </button>
                ))}
              </div>
            </label>
            <label className="admin-field">
              Колір
              <div className="admin-radio-row">
                {MINECRAFT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.code}
                    className={"donate-color-btn" + (colorHex === c.hex ? " active" : "")}
                    style={{ background: c.hex }}
                    title={c.label}
                    onClick={() => setColorHex(c.hex)}
                  />
                ))}
              </div>
            </label>
          </>
        )}

        <label className="admin-field">
          Тривалість (днів)
          <input
            type="number"
            value={durationDays}
            min={1}
            onChange={(e) => setDurationDays(Number(e.target.value))}
          />
        </label>

        {error && <p className="profile-bio-error">{error}</p>}

        <div className="admin-form-actions">
          <button type="button" onClick={submit} disabled={pending}>
            Видати
          </button>
        </div>
      </div>

      <p className="admin-privileges-summary">
        Активних привілегій: {activeCount} з {privileges.length}
      </p>

      <div className="admin-achievements-list">
        {privileges.length === 0 && <p>Привілеїй ще не видавали.</p>}
        {privileges.map((p) => {
          const active = isActive(p.expiresAt);
          const icon = p.tier === "FLORIST" ? FLORIST_SYMBOL : p.iconSymbol || "★";
          const color = p.tier === "FLORIST" ? FLORIST_COLOR_HEX : p.iconColorHex || "#FFFFFF";
          return (
            <div className="admin-achievements-row" key={p.id}>
              <span className="donate-icon-preview-static" style={{ color }}>
                {icon}
              </span>
              <div className="admin-achievements-row-info">
                <b>{p.nickname}</b>
                <span>
                  {p.tier === "FLORIST" ? "Флорист" : "Меценат"} —{" "}
                  <span className={active ? "admin-privilege-active" : "admin-privilege-expired"}>
                    {active
                      ? `активна до ${formatDate(p.expiresAt)} (залишилось ${formatRemaining(p.expiresAt)})`
                      : `закінчилась ${formatDate(p.expiresAt)}`}
                  </span>
                </span>
              </div>
              <div className="admin-achievements-row-actions">
                <button type="button" onClick={() => remove(p)} disabled={pending}>
                  Забрати
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
