"use client";

import { useState, useTransition } from "react";
import { proposeSeasonChange } from "@/lib/actions/gallery";
import {
  syncActiveRoleNow,
  updateSeasonRewards,
  updateSeasonStart,
  type SeasonAdminData,
  type SeasonRewardsInput,
} from "@/lib/actions/seasons";

type Message = { ok?: string; error?: string } | null;

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return message.error ? (
    <p className="profile-bio-error">{message.error}</p>
  ) : (
    <p className="admin-luckperms-success">{message.ok}</p>
  );
}

const TIERS = [
  { key: "player", title: "Усі, хто награв понад поріг" },
  { key: "top", title: "Топ за часом гри" },
  { key: "podium", title: "Найвищі місця" },
] as const;

export default function SeasonAdmin({ data }: { data: SeasonAdminData }) {
  const [pending, startTransition] = useTransition();
  const [startedOn, setStartedOn] = useState(data.startedOn);
  const { id: _id, ...initialRewards } = data.rewards;
  const [rewards, setRewards] = useState<SeasonRewardsInput>(initialRewards);
  const [seasonMsg, setSeasonMsg] = useState<Message>(null);
  const [roleMsg, setRoleMsg] = useState<Message>(null);
  const [rewardsMsg, setRewardsMsg] = useState<Message>(null);

  const need = data.requirement;
  const requirementText =
    need.seasonHours === 0
      ? "голосувати можуть усі з привʼязаним акаунтом Minecraft"
      : `потрібно ${need.seasonHours} год гри в сезоні${need.recentHours ? `, з них ${need.recentHours} год — за останні 3 місяці` : ""}`;

  const set = (field: keyof SeasonRewardsInput, value: string | number) => setRewards((r) => ({ ...r, [field]: value }));

  return (
    <div className="admin-season">
      <p className="admin-privileges-summary">
        Поточний сезон: <b>{data.number}</b>, {data.month}-й місяць — «Активний гравець»: {requirementText}.
      </p>

      <label className="admin-field">
        Початок сезону (від нього рахуються місяці)
        <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
      </label>
      <div className="admin-form-actions">
        <button
          type="button"
          disabled={pending || startedOn === data.startedOn}
          onClick={() =>
            startTransition(async () => {
              const r = await updateSeasonStart(startedOn);
              setSeasonMsg("error" in r ? r : { ok: "Дату збережено." });
            })
          }
        >
          Зберегти дату
        </button>
      </div>

      {data.pendingSeason !== null ? (
        <p className="admin-gallery-pending">
          <i className="fa-solid fa-clock"></i> Очікує підтвердження в Discord: початок {data.pendingSeason}-го сезону
        </p>
      ) : (
        <>
          <p className="admin-season-warning">
            Зміна сезону зберігає статистику {data.number}-го сезону, видає картки та роль «Гравець {data.number}{" "}
            сезону». Підтвердіть її в Discord <b>до</b> того, як обнулите статистику на сервері.
          </p>
          <div className="admin-form-actions">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Завершити ${data.number}-й сезон і почати ${data.number + 1}-й?`)) return;
                startTransition(async () => {
                  const r = await proposeSeasonChange();
                  setSeasonMsg("error" in r ? r : { ok: "Запит надіслано в Discord — підтвердіть його там." });
                });
              }}
            >
              Почати {data.number + 1}-й сезон
            </button>
          </div>
        </>
      )}
      <Feedback message={seasonMsg} />

      <h4 className="admin-gallery-photos-title">Роль «Активний гравець»</h4>
      <p className="admin-privileges-summary">Оновлюється щогодини. Можна оновити й зараз.</p>
      <div className="admin-form-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setRoleMsg(null);
              setRoleMsg(await syncActiveRoleNow());
            })
          }
        >
          Оновити роль зараз
        </button>
      </div>
      <Feedback message={roleMsg} />

      <h4 className="admin-gallery-photos-title">Картки за сезон</h4>
      <div className="admin-season-counts">
        <label className="admin-field">
          Від скількох годин
          <input type="number" min={0} value={rewards.minHours} onChange={(e) => set("minHours", Number(e.target.value))} />
        </label>
        <label className="admin-field">
          Топ (місць)
          <input type="number" min={0} value={rewards.topCount} onChange={(e) => set("topCount", Number(e.target.value))} />
        </label>
        <label className="admin-field">
          Найвищі місця
          <input
            type="number"
            min={0}
            value={rewards.podiumCount}
            onChange={(e) => set("podiumCount", Number(e.target.value))}
          />
        </label>
      </div>
      {TIERS.map((tier) => (
        <div key={tier.key} className="admin-season-tier">
          <span className="admin-season-tier-title">{tier.title}</span>
          <label className="admin-field">
            Підпис
            <input type="text" value={rewards[`${tier.key}Label`]} onChange={(e) => set(`${tier.key}Label`, e.target.value)} maxLength={30} />
          </label>
          <label className="admin-field">
            Іконка
            <input type="text" value={rewards[`${tier.key}Icon`]} onChange={(e) => set(`${tier.key}Icon`, e.target.value)} maxLength={16} />
          </label>
          <label className="admin-field">
            Обводка
            <input type="color" value={rewards[`${tier.key}Color`]} onChange={(e) => set(`${tier.key}Color`, e.target.value)} />
          </label>
        </div>
      ))}
      <p className="admin-privileges-summary">
        На картці: підпис, іконка, «Сезон N» і «Награно X год» (у топі — ще й місце).
      </p>
      <div className="admin-form-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateSeasonRewards(rewards);
              setRewardsMsg("error" in r ? r : { ok: "Збережено." });
            })
          }
        >
          Зберегти картки
        </button>
      </div>
      <Feedback message={rewardsMsg} />
    </div>
  );
}
