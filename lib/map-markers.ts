// Shared by the /map suggestion form (client), the suggest server action,
// the Discord moderation flow and the /live-map proxy — so the limits and
// validation are the same everywhere. No server-only imports here.

import type { MapMarkerType } from "@prisma/client";

export const MARKER_TYPES: MapMarkerType[] = ["CITY", "FARM", "EVENT", "MONUMENT"];

export const MARKER_TYPE_LABEL: Record<MapMarkerType, string> = {
  CITY: "Місто",
  FARM: "Ферма",
  EVENT: "Івент",
  MONUMENT: "Монумент",
};

export const MARKER_TYPE_EMOJI: Record<MapMarkerType, string> = {
  CITY: "🏰",
  FARM: "🌾",
  EVENT: "🎉",
  MONUMENT: "🗿",
};

const MARKER_TYPE_COLOR: Record<MapMarkerType, string> = {
  CITY: "#3b6cff",
  FARM: "#3ecf6e",
  EVENT: "#ff9f1c",
  MONUMENT: "#9b5cff",
};

export const MARKER_LIMITS = {
  labelMin: 2,
  labelMax: 40,
  descriptionMax: 300,
  // The world border (see BlueMap's own "Кордон світу" line marker).
  coordMax: 5000,
  yMin: -64,
  yMax: 320,
  // Anti-spam: at most this many suggestions waiting for review per player,
  // and a cooldown between any two suggestions.
  maxPendingPerUser: 3,
  cooldownMs: 10 * 60_000,
  durationMaxDays: 365,
};

// Choices offered in the form; null = permanent. Moderators can set any
// whole number of days up to MARKER_LIMITS.durationMaxDays via Discord.
export const MARKER_DURATIONS: (number | null)[] = [null, 7, 30, 90];

export function durationLabel(days: number | null): string {
  if (days === null) return "Назавжди";
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : [2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100) ? "дні" : "днів";
  return `${days} ${word}`;
}

// Only real invite links — this ends up inside an href in HTML the map
// renders, so the pattern is deliberately strict (no quotes/spaces possible).
export const DISCORD_INVITE_RE = /^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}$/;

export type MarkerInput = {
  label: string;
  type: MapMarkerType;
  description: string;
  discordInvite: string;
  x: number;
  y: number;
  z: number;
  durationDays: number | null;
};

export type CleanMarker = Omit<MarkerInput, "description" | "discordInvite"> & {
  description: string | null;
  discordInvite: string | null;
};

// Returns the normalized marker, or an error message in Ukrainian.
export function validateMarker(input: MarkerInput): CleanMarker | { error: string } {
  const label = String(input.label ?? "").trim().replace(/\s+/g, " ");
  if (label.length < MARKER_LIMITS.labelMin || label.length > MARKER_LIMITS.labelMax) {
    return { error: `Назва має бути від ${MARKER_LIMITS.labelMin} до ${MARKER_LIMITS.labelMax} символів` };
  }
  // BlueMap shows the label in its marker list; keep markup characters out.
  if (/[<>]/.test(label)) return { error: "Назва не може містити < або >" };

  if (!MARKER_TYPES.includes(input.type)) return { error: "Невідомий тип мітки" };

  const description = String(input.description ?? "").trim();
  if (description.length > MARKER_LIMITS.descriptionMax) {
    return { error: `Опис — до ${MARKER_LIMITS.descriptionMax} символів` };
  }

  const discordInvite = input.type === "CITY" ? String(input.discordInvite ?? "").trim() : "";
  if (discordInvite && !DISCORD_INVITE_RE.test(discordInvite)) {
    return { error: "Посилання має бути запрошенням Discord: https://discord.gg/…" };
  }

  const [x, y, z] = [input.x, input.y, input.z].map(Number);
  if (![x, y, z].every(Number.isInteger)) return { error: "Координати мають бути цілими числами" };
  if (Math.abs(x) > MARKER_LIMITS.coordMax || Math.abs(z) > MARKER_LIMITS.coordMax) {
    return { error: `Координати X і Z — у межах ±${MARKER_LIMITS.coordMax}` };
  }
  if (y < MARKER_LIMITS.yMin || y > MARKER_LIMITS.yMax) {
    return { error: `Y — від ${MARKER_LIMITS.yMin} до ${MARKER_LIMITS.yMax}` };
  }

  const durationDays = input.durationDays === null ? null : Number(input.durationDays);
  if (
    durationDays !== null &&
    (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MARKER_LIMITS.durationMaxDays)
  ) {
    return { error: `Термін — від 1 до ${MARKER_LIMITS.durationMaxDays} днів, або назавжди` };
  }

  return { label, type: input.type, description: description || null, discordInvite: discordInvite || null, x, y, z, durationDays };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// A round colored pin with the type's emoji, as an inline SVG data URI — no
// icon files to host, and nothing user-supplied goes into it.
function markerIcon(type: MapMarkerType): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">` +
    `<circle cx="17" cy="17" r="15" fill="#161616" stroke="${MARKER_TYPE_COLOR[type]}" stroke-width="3"/>` +
    `<text x="17" y="23" font-size="16" text-anchor="middle">${MARKER_TYPE_EMOJI[type]}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type ApprovedMarker = {
  id: string;
  label: string;
  type: MapMarkerType;
  description: string | null;
  discordInvite: string | null;
  x: number;
  y: number;
  z: number;
  nickname: string;
  expiresAt: Date | null;
};

// BlueMap's live markers.json "marker set" shape (as served by BlueMap 5.22
// itself — see /live-map/maps/map/live/markers.json). `detail` is rendered
// as HTML in the marker popup, hence every user string is escaped.
export function buildPlayerMarkerSet(markers: ApprovedMarker[]) {
  return {
    label: "Мітки гравців",
    toggleable: true,
    defaultHidden: false,
    sorting: 1,
    markers: Object.fromEntries(
      markers.map((m) => {
        const color = MARKER_TYPE_COLOR[m.type];
        const detail =
          `<div style="min-width:180px;max-width:260px;font-family:sans-serif;line-height:1.4">` +
          `<div style="font-weight:700;font-size:15px">${escapeHtml(m.label)}</div>` +
          `<div style="color:${color};font-size:12px;margin:2px 0 6px">${MARKER_TYPE_EMOJI[m.type]} ${MARKER_TYPE_LABEL[m.type]} · ${m.x} ${m.y} ${m.z}</div>` +
          (m.description ? `<div style="white-space:pre-wrap;font-size:13px">${escapeHtml(m.description)}</div>` : "") +
          (m.expiresAt
            ? `<div style="margin-top:6px;font-size:11px;opacity:.6">Діє до ${m.expiresAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })}</div>`
            : "") +
          (m.discordInvite
            ? `<a href="${m.discordInvite}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;color:#8ea1ff">Discord міста ↗</a>`
            : "") +
          `<div style="margin-top:6px;font-size:11px;opacity:.6">Запропонував: ${escapeHtml(m.nickname)}</div>` +
          `</div>`;
        return [
          `player-${m.id}`,
          {
            type: "poi",
            label: m.label,
            detail,
            icon: markerIcon(m.type),
            anchor: { x: 17, y: 17 },
            classes: [],
            position: { x: m.x + 0.5, y: m.y, z: m.z + 0.5 },
            sorting: 0,
            listed: true,
            minDistance: 0,
            maxDistance: 10_000_000,
          },
        ];
      })
    ),
  };
}
