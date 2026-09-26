"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/profile";
import { deleteMyAccount } from "@/lib/actions/account";
import { BIO_LINK_ERROR, bioContainsLink } from "@/lib/bio-links";
import { PRONOUN_OPTIONS } from "@/lib/format-last-seen";

const MAX_BIO_LENGTH = 160;

export default function ProfileEditor({
  nickname,
  isOwner,
  initialBio,
  discordId,
  discordName,
  initialShowDiscord,
  initialTwitchUrl,
  initialYoutubeUrl,
  initialPronoun,
}: {
  nickname: string;
  isOwner: boolean;
  initialBio: string | null;
  discordId: string | null;
  discordName: string | null;
  initialShowDiscord: boolean;
  initialTwitchUrl: string | null;
  initialYoutubeUrl: string | null;
  initialPronoun: string | null;
}) {
  const [savedBio, setSavedBio] = useState(initialBio);
  const [showDiscord, setShowDiscord] = useState(initialShowDiscord);
  const [twitchUrl, setTwitchUrl] = useState(initialTwitchUrl);
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);

  const [editing, setEditing] = useState(false);
  const [bioInput, setBioInput] = useState(initialBio ?? "");
  const [discordInput, setDiscordInput] = useState(initialShowDiscord);
  const [twitchInput, setTwitchInput] = useState(initialTwitchUrl ?? "");
  const [youtubeInput, setYoutubeInput] = useState(initialYoutubeUrl ?? "");
  const [pronounInput, setPronounInput] = useState(initialPronoun ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasDiscordBadge = showDiscord && !!discordName;
  const hasAnySocial = hasDiscordBadge || !!twitchUrl || !!youtubeUrl;
  const showBioBlock = isOwner || !!savedBio;

  function startEdit() {
    setBioInput(savedBio ?? "");
    setDiscordInput(showDiscord);
    setTwitchInput(twitchUrl ?? "");
    setYoutubeInput(youtubeUrl ?? "");
    setPronounInput(initialPronoun ?? "");
    setError(null);
    setEditing(true);
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  function deleteAccount() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccount(deleteConfirm);
      if ("error" in result) return setError(result.error);
      // Sessions are gone server-side; a full reload lands logged out.
      window.location.href = "/";
    });
  }

  function save() {
    setError(null);
    // Same check the server enforces — here for an instant, readable message
    // (production hides server-action error text).
    if (bioContainsLink(bioInput)) {
      setError(BIO_LINK_ERROR);
      return;
    }
    startTransition(async () => {
      try {
        await updateProfile(nickname, {
          bio: bioInput,
          showDiscord: discordInput,
          twitchUrl: twitchInput,
          youtubeUrl: youtubeInput,
          pronoun: pronounInput,
        });
        setSavedBio(bioInput.trim() || null);
        setShowDiscord(discordInput);
        setTwitchUrl(twitchInput.trim() ? normalizePreview(twitchInput) : null);
        setYoutubeUrl(youtubeInput.trim() ? normalizePreview(youtubeInput) : null);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не вдалося зберегти");
      }
    });
  }

  // Mirrors lib/actions/profile.ts's normalizeUrl, just for the optimistic
  // local update after a successful save — the server value is the source
  // of truth on the next real page load either way.
  function normalizePreview(value: string) {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  return (
    <>
      {showBioBlock && (
        <div className="profile-bio">
          {editing ? (
            <textarea
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value.slice(0, MAX_BIO_LENGTH))}
              maxLength={MAX_BIO_LENGTH}
              placeholder="Розкажіть про себе..."
              rows={3}
              autoFocus
            />
          ) : savedBio ? (
            <p className="profile-bio-text">{savedBio}</p>
          ) : (
            <p className="profile-bio-placeholder">Опис відсутній...</p>
          )}
        </div>
      )}

      {hasAnySocial && (
        <div className="profile-social-icons-card">
          <div className="profile-social-icons">
            {hasDiscordBadge && discordId && (
              <a
                href={`https://discordapp.com/users/${discordId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-social-icon profile-social-discord"
                title={discordName ?? undefined}
              >
                <i className="fa-brands fa-discord"></i>
              </a>
            )}
            {twitchUrl && (
              <a
                href={twitchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-social-icon profile-social-twitch"
                title="Twitch"
              >
                <i className="fa-brands fa-twitch"></i>
              </a>
            )}
            {youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-social-icon profile-social-youtube"
                title="YouTube"
              >
                <i className="fa-brands fa-youtube"></i>
              </a>
            )}
          </div>
        </div>
      )}

      {isOwner && editing && (
        <div className="profile-editor-actions">
          {discordName && (
            <label className="profile-social-field profile-social-field-checkbox">
              <input
                type="checkbox"
                checked={discordInput}
                onChange={(e) => setDiscordInput(e.target.checked)}
              />
              <i className="fa-brands fa-discord"></i>
              Показувати Discord ({discordName})
            </label>
          )}
          <label className="profile-social-field">
            <i className="fa-brands fa-twitch"></i>
            <input
              type="text"
              placeholder="Посилання на Twitch"
              value={twitchInput}
              onChange={(e) => setTwitchInput(e.target.value)}
            />
          </label>
          <label className="profile-social-field">
            <i className="fa-brands fa-youtube"></i>
            <input
              type="text"
              placeholder="Посилання на YouTube"
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
            />
          </label>

          <div className="profile-pronoun-field">
            <span className="profile-pronoun-label">Звертання</span>
            <div className="profile-pronoun-options">
              {PRONOUN_OPTIONS.map((opt) => (
                <label key={opt.value} className="profile-pronoun-option">
                  <input
                    type="radio"
                    name="pronoun"
                    checked={pronounInput === opt.value}
                    onChange={() => setPronounInput(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="profile-bio-footer">
            <span className="profile-bio-counter">
              {bioInput.length}/{MAX_BIO_LENGTH}
            </span>
            <div className="profile-bio-actions">
              <button type="button" onClick={() => setEditing(false)} disabled={pending}>
                Скасувати
              </button>
              <button type="button" onClick={save} disabled={pending}>
                Зберегти
              </button>
            </div>
          </div>
          {error && <p className="profile-bio-error">{error}</p>}

          {/* Account deletion (see /privacy) — typed confirmation, since it
              can't be undone. */}
          <div className="profile-delete-account">
            {!deleteOpen ? (
              <button type="button" className="profile-delete-link" onClick={() => setDeleteOpen(true)}>
                Видалити акаунт на сайті
              </button>
            ) : (
              <>
                <p>
                  Буде видалено ваш опис, мітки на мапі, прив&apos;язку до Discord та інші дані профілю. Записи
                  про покупки зберігаються для обліку, але без ваших даних. Скасувати це неможливо.
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Введіть ВИДАЛИТИ"
                />
                <div className="profile-bio-actions">
                  <button type="button" onClick={() => setDeleteOpen(false)} disabled={pending}>
                    Скасувати
                  </button>
                  <button type="button" className="admin-danger-btn" onClick={deleteAccount} disabled={pending}>
                    Видалити назавжди
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isOwner && !editing && (
        <button type="button" className="profile-edit-btn" onClick={startEdit}>
          <i className="fa-solid fa-pen"></i>
          Редагувати профіль
        </button>
      )}
    </>
  );
}
