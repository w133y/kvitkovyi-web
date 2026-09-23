// Moderation message for a player-suggested map marker, in the map channel.
// Clicks are handled by app/api/discord/interactions/route.ts (custom_id
// scheme "marker:<action>:<markerId>"), mirroring lib/gallery-discord.ts.

import { sendDiscordMessage, editDiscordMessage, type DiscordEmbed, type DiscordActionRow } from "@/lib/discord";
import { MARKER_TYPES, MARKER_TYPE_COLOR, MARKER_TYPE_EMOJI, MARKER_TYPE_LABEL, durationLabel } from "@/lib/map-markers";
import type { MapMarker, MapMarkerStatus } from "@prisma/client";

export const MAP_MARKERS_CHANNEL_ID = "1552440120223867010";

const STATUS_LABEL: Record<MapMarkerStatus, string> = {
  PENDING: "⏳ На розгляді",
  APPROVED: "✅ На мапі",
  REJECTED: "❌ Відхилено",
};

const STATUS_COLOR: Record<MapMarkerStatus, number> = {
  PENDING: 0xffd139,
  APPROVED: 0x4caf50,
  REJECTED: 0xff5555,
};

function mapLink(m: MapMarker): string {
  const site = process.env.SITE_URL?.replace(/\/$/, "") ?? "";
  return `${site}/map?x=${m.x}&y=${m.y}&z=${m.z}`;
}

function termText(m: MapMarker): string {
  const base = durationLabel(m.durationDays);
  if (!m.expiresAt) return base;
  const date = m.expiresAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
  return m.expiresAt < new Date() ? `${base} · ⌛ минув ${date}` : `${base} · до ${date}`;
}

function buildEmbed(m: MapMarker): DiscordEmbed {
  return {
    title: `${m.icon ?? MARKER_TYPE_EMOJI[m.type]} ${m.label}`,
    color: STATUS_COLOR[m.status],
    fields: [
      { name: "Тип", value: MARKER_TYPE_LABEL[m.type], inline: true },
      { name: "Координати", value: `[${m.x} ${m.y} ${m.z}](${mapLink(m)})`, inline: true },
      { name: "Гравець", value: m.nickname, inline: true },
      { name: "Опис", value: m.description?.trim() || "—", inline: false },
      ...(m.type === "CITY" ? [{ name: "Discord міста", value: m.discordInvite || "—", inline: false }] : []),
      { name: "Термін", value: termText(m), inline: true },
      {
        name: "Вигляд",
        value: `${m.icon ?? MARKER_TYPE_EMOJI[m.type]} · ${m.color ?? `${MARKER_TYPE_COLOR[m.type]} (як у типу)`}`,
        inline: true,
      },
      { name: "Статус", value: STATUS_LABEL[m.status], inline: false },
    ],
    timestamp: m.createdAt.toISOString(),
  };
}

function buildComponents(m: MapMarker): DiscordActionRow[] {
  const buttons = [];
  if (m.status !== "APPROVED") {
    buttons.push({ type: 2 as const, style: 3 as const, label: "Схвалити", custom_id: `marker:approve:${m.id}`, emoji: { name: "✅" } });
  }
  buttons.push({
    type: 2 as const,
    style: 4 as const,
    label: m.status === "APPROVED" ? "Прибрати з мапи" : "Відхилити",
    custom_id: `marker:reject:${m.id}`,
    emoji: { name: "🗑️" },
  });
  buttons.push({ type: 2 as const, style: 2 as const, label: "Редагувати", custom_id: `marker:edit:${m.id}`, emoji: { name: "✏️" } });
  return [
    { type: 1, components: buttons },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `marker:type:${m.id}`,
          placeholder: "Тип мітки",
          options: MARKER_TYPES.map((t) => ({
            label: MARKER_TYPE_LABEL[t],
            value: t,
            emoji: { name: MARKER_TYPE_EMOJI[t] },
            default: t === m.type,
          })),
        },
      ],
    },
  ];
}

export async function postMarkerModeration(m: MapMarker): Promise<string | null> {
  return sendDiscordMessage(MAP_MARKERS_CHANNEL_ID, { embeds: [buildEmbed(m)], components: buildComponents(m) });
}

export async function updateMarkerModeration(m: MapMarker): Promise<void> {
  if (!m.discordMessageId) return;
  await editDiscordMessage(MAP_MARKERS_CHANNEL_ID, m.discordMessageId, {
    embeds: [buildEmbed(m)],
    components: buildComponents(m),
  });
}
