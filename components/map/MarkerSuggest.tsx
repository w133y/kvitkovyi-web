"use client";

// "Запропонувати мітку" — floating button + form over the /map BlueMap
// iframe. Submits to lib/actions/map-markers.ts, which queues the marker
// for review in Discord.

import { useEffect, useState, useTransition } from "react";
import type { MapMarkerType } from "@prisma/client";
import { suggestMapMarker } from "@/lib/actions/map-markers";
import {
  MARKER_DURATIONS,
  MARKER_LIMITS,
  MARKER_TYPES,
  MARKER_TYPE_EMOJI,
  MARKER_TYPE_LABEL,
  durationLabel,
} from "@/lib/map-markers";

const EMPTY = {
  label: "",
  type: "CITY" as MapMarkerType,
  description: "",
  discordInvite: "",
  x: "",
  y: "",
  z: "",
  durationDays: null as number | null,
};

type Vec3 = { x: number; y: number; z: number };
type BlueMapApp = {
  mapViewer: { controlsManager: { position: Vec3 } };
  // BlueMap dispatches "bluemapMapInteraction" here on every map click,
  // with the clicked world point in detail.hit.point.
  events: EventTarget;
};

function getBlueMap(): BlueMapApp | null {
  try {
    const frame = document.querySelector<HTMLIFrameElement>("iframe.map-frame");
    return (frame?.contentWindow as unknown as { bluemap?: BlueMapApp })?.bluemap ?? null;
  } catch {
    return null;
  }
}

// The iframe is same-origin (served through the /live-map proxy), so the
// BlueMap app itself is reachable — its camera target and click events.
function readMapCenter(): Vec3 | null {
  const pos = getBlueMap()?.mapViewer.controlsManager.position;
  return pos ? { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) } : null;
}

export default function MarkerSuggest({ signedIn, hasLink }: { signedIn: boolean; hasLink: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // "Pick on map" mode: the panel hides so the whole map is clickable, and
  // the next map click fills in the coordinates.
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!picking) return;
    const events = getBlueMap()?.events;
    if (!events) return;
    const onClick = (e: Event) => {
      const p = (e as CustomEvent<{ hit?: { point?: Vec3 } }>).detail?.hit?.point;
      if (!p) return; // clicked the sky/void — keep waiting
      setForm((f) => ({ ...f, x: String(Math.floor(p.x)), y: String(Math.round(p.y)), z: String(Math.floor(p.z)) }));
      setPicking(false);
    };
    events.addEventListener("bluemapMapInteraction", onClick);
    return () => events.removeEventListener("bluemapMapInteraction", onClick);
  }, [picking]);

  const set = (field: "label" | "description" | "discordInvite" | "x" | "y" | "z") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function fillFromMapCenter() {
    const c = readMapCenter();
    if (!c) return setError("Не вдалося зчитати позицію мапи — впишіть координати вручну");
    setError(null);
    setForm((f) => ({ ...f, x: String(c.x), y: String(c.y), z: String(c.z) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await suggestMapMarker({
        ...form,
        x: Number(form.x),
        y: Number(form.y),
        z: Number(form.z),
      });
      if ("error" in result) return setError(result.error);
      setDone(true);
      setForm(EMPTY);
    });
  }

  function startPicking() {
    if (!getBlueMap()) return setError("Мапа ще не завантажилась — спробуйте за мить");
    setError(null);
    setPicking(true);
  }

  function toggle() {
    setPicking(false);
    setOpen((o) => !o);
    setDone(false);
    setError(null);
  }

  return (
    <>
      <button type="button" className="map-suggest-btn" onClick={toggle} aria-expanded={open}>
        <i className={open ? "fa-solid fa-xmark" : "fa-solid fa-location-dot"} aria-hidden="true"></i>
        {open ? "Закрити" : "Запропонувати мітку"}
      </button>

      {open && picking && (
        <div className="map-suggest-picking">
          <i className="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          Клікніть на мапі, щоб вибрати точку
          <button type="button" onClick={() => setPicking(false)}>
            Скасувати
          </button>
        </div>
      )}

      {open && !picking && (
        <div className="map-suggest-panel" role="dialog" aria-label="Запропонувати мітку">
          <h3>Нова мітка</h3>

          {!signedIn ? (
            <p className="map-suggest-note">Увійдіть через Discord, щоб запропонувати мітку.</p>
          ) : !hasLink ? (
            <p className="map-suggest-note">Спершу прив&apos;яжіть свій нікнейм на сервері до Discord.</p>
          ) : done ? (
            <div className="map-suggest-done">
              <p>Дякуємо! Мітку надіслано на перевірку — після схвалення вона з&apos;явиться на мапі.</p>
              <button type="button" onClick={() => setDone(false)}>
                Запропонувати ще
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className="map-suggest-field">
                Назва
                <input
                  value={form.label}
                  onChange={set("label")}
                  maxLength={MARKER_LIMITS.labelMax}
                  placeholder="Наприклад: Ню-Ріно"
                  required
                />
              </label>

              <div className="map-suggest-field">
                Тип
                <div className="map-suggest-types">
                  {MARKER_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={form.type === t ? "active" : ""}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                    >
                      <span aria-hidden="true">{MARKER_TYPE_EMOJI[t]}</span>
                      {MARKER_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="map-suggest-field">
                <span className="map-suggest-coords-head">
                  Координати
                  <span className="map-suggest-coords-actions">
                    <button type="button" onClick={startPicking}>
                      <i className="fa-solid fa-hand-pointer" aria-hidden="true"></i> На мапі
                    </button>
                    <button type="button" onClick={fillFromMapCenter}>
                      <i className="fa-solid fa-crosshairs" aria-hidden="true"></i> Центр мапи
                    </button>
                  </span>
                </span>
                <div className="map-suggest-coords">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <input
                      key={axis}
                      value={form[axis]}
                      onChange={set(axis)}
                      inputMode="numeric"
                      placeholder={axis.toUpperCase()}
                      aria-label={axis.toUpperCase()}
                      required
                    />
                  ))}
                </div>
              </div>

              <label className="map-suggest-field">
                <span className="map-suggest-coords-head">
                  Опис
                  <span className="map-suggest-counter">
                    {form.description.length}/{MARKER_LIMITS.descriptionMax}
                  </span>
                </span>
                <textarea
                  value={form.description}
                  onChange={set("description")}
                  maxLength={MARKER_LIMITS.descriptionMax}
                  rows={3}
                  placeholder="Що тут знаходиться?"
                />
              </label>

              <div className="map-suggest-field">
                Термін
                <div className="map-suggest-durations">
                  {MARKER_DURATIONS.map((d) => (
                    <button
                      type="button"
                      key={d ?? "forever"}
                      className={form.durationDays === d ? "active" : ""}
                      onClick={() => setForm((f) => ({ ...f, durationDays: d }))}
                    >
                      {durationLabel(d)}
                    </button>
                  ))}
                </div>
              </div>

              {form.type === "CITY" && (
                <label className="map-suggest-field">
                  Discord міста (необов&apos;язково)
                  <input value={form.discordInvite} onChange={set("discordInvite")} placeholder="https://discord.gg/…" />
                </label>
              )}

              {error && <p className="map-suggest-error">{error}</p>}

              <button type="submit" className="map-suggest-submit" disabled={pending}>
                {pending ? "Надсилаємо..." : "Надіслати на перевірку"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
