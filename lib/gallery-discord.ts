// Posts/updates a submitted gallery photo's moderation message — the
// approve/delete/edit-description/toggle-description workflow lives here as
// message buttons, handled on click by app/api/discord/interactions/route.ts
// (custom_id scheme: "gallery:<action>:<photoId>"). Also handles the
// separate "change the season?" Yes/No confirmation for the admin panel.

import { sendDiscordMessage, editDiscordMessage, type DiscordEmbed, type DiscordActionRow } from "@/lib/discord";
import type { GalleryPhoto, GalleryPhotoSource, GalleryPhotoStatus } from "@prisma/client";

const SOURCE_LABEL: Record<GalleryPhotoSource, string> = {
  SITE: "Сайт",
  DISCORD: "Discord (/gallery)",
  LEGACY: "Старе фото",
};

const STATUS_LABEL: Record<GalleryPhotoStatus, string> = {
  PENDING: "⏳ На розгляді",
  APPROVED: "✅ Додано в галерею",
  REJECTED: "❌ Відхилено",
};

const STATUS_COLOR: Record<GalleryPhotoStatus, number> = {
  PENDING: 0xffd139,
  APPROVED: 0x4caf50,
  REJECTED: 0xff5555,
};

function buildModerationEmbed(photo: GalleryPhoto): DiscordEmbed {
  return {
    title: "Фото для галереї",
    color: STATUS_COLOR[photo.status],
    image: { url: photo.url },
    fields: [
      { name: "Автор", value: photo.author?.trim() || "—", inline: true },
      { name: "Сезон", value: String(photo.season), inline: true },
      { name: "Джерело", value: SOURCE_LABEL[photo.source], inline: true },
      { name: "Опис", value: photo.description?.trim() || "—", inline: false },
      {
        name: "Статус",
        value: `${STATUS_LABEL[photo.status]}${
          photo.status !== "PENDING"
            ? ` · опис ${photo.showDescription ? "показано" : "приховано"} · автор ${photo.showAuthor ? "показано" : "приховано"}`
            : ""
        }`,
        inline: false,
      },
    ],
    timestamp: photo.createdAt.toISOString(),
  };
}

function buildModerationButtons(photo: GalleryPhoto): DiscordActionRow[] {
  const buttons = [];
  if (photo.status !== "APPROVED") {
    buttons.push({
      type: 2 as const,
      style: 3 as const,
      label: "Додати",
      custom_id: `gallery:approve:${photo.id}`,
      emoji: { name: "✅" },
    });
  }
  buttons.push({
    type: 2 as const,
    style: 4 as const,
    label: photo.status === "APPROVED" ? "Видалити" : "Відхилити",
    custom_id: `gallery:reject:${photo.id}`,
    emoji: { name: "🗑️" },
  });
  buttons.push({
    type: 2 as const,
    style: 2 as const,
    label: "Опис",
    custom_id: `gallery:edit_desc:${photo.id}`,
    emoji: { name: "✏️" },
  });
  buttons.push({
    type: 2 as const,
    style: 2 as const,
    label: photo.showDescription ? "Опис: увімк" : "Опис: вимк",
    custom_id: `gallery:toggle_desc:${photo.id}`,
    emoji: { name: "👁️" },
  });
  buttons.push({
    type: 2 as const,
    style: 2 as const,
    label: "Автор",
    custom_id: `gallery:edit_author:${photo.id}`,
    emoji: { name: "✏️" },
  });
  buttons.push({
    type: 2 as const,
    style: 2 as const,
    label: photo.showAuthor ? "Автор: увімк" : "Автор: вимк",
    custom_id: `gallery:toggle_author:${photo.id}`,
    emoji: { name: "👁️" },
  });
  // Discord caps action rows at 5 buttons — six moderation actions (five
  // once approved, since "Додати" drops off) need a second row rather than
  // one overflowing row. An action row can't have zero components, so the
  // second row is only added when there's actually an overflow button.
  const rows: DiscordActionRow[] = [{ type: 1, components: buttons.slice(0, 5) }];
  if (buttons.length > 5) rows.push({ type: 1, components: buttons.slice(5) });
  return rows;
}

function getGalleryChannelId(): string | null {
  const id = process.env.DISCORD_GALLERY_CHANNEL_ID;
  if (!id) {
    console.error("gallery-discord: DISCORD_GALLERY_CHANNEL_ID не налаштовано (перевірте .env)");
    return null;
  }
  return id;
}

// Posts the initial moderation entry and returns its message id to store
// on the photo — best-effort, never blocks the submission itself.
export async function postGalleryModeration(photo: GalleryPhoto): Promise<string | null> {
  const channelId = getGalleryChannelId();
  if (!channelId) return null;
  return sendDiscordMessage(channelId, {
    embeds: [buildModerationEmbed(photo)],
    components: buildModerationButtons(photo),
  });
}

// Re-renders the same moderation message after a button click changes the
// photo's state (approve/reject/edit description/toggle description).
export async function updateGalleryModeration(photo: GalleryPhoto): Promise<void> {
  const channelId = getGalleryChannelId();
  if (!channelId || !photo.discordMessageId) return;
  await editDiscordMessage(channelId, photo.discordMessageId, {
    embeds: [buildModerationEmbed(photo)],
    components: buildModerationButtons(photo),
  });
}

function getAdminConfirmChannelId(): string | null {
  const id = process.env.DISCORD_ADMIN_CONFIRM_CHANNEL_ID;
  if (!id) {
    console.error("gallery-discord: DISCORD_ADMIN_CONFIRM_CHANNEL_ID не налаштовано (перевірте .env)");
    return null;
  }
  return id;
}

// Posts the Yes/No confirmation for an admin's proposed season change —
// applying it happens on button click (see the interactions route), not
// here, so this never touches GallerySettings.currentSeason itself.
export async function postSeasonChangeConfirm(params: {
  newSeason: number;
  adminName: string;
}): Promise<string | null> {
  const channelId = getAdminConfirmChannelId();
  if (!channelId) return null;
  return sendDiscordMessage(channelId, {
    embeds: [
      {
        title: "Змінити сезон галереї?",
        description: `**${params.adminName}** пропонує встановити сезон **${params.newSeason}** як поточний за замовчуванням для нових фото.`,
        color: 0xffd139,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Так", custom_id: "season:confirm:yes", emoji: { name: "✅" } },
          { type: 2, style: 4, label: "Ні", custom_id: "season:confirm:no", emoji: { name: "❌" } },
        ],
      },
    ],
  });
}

export async function editSeasonChangeResult(messageId: string, resultText: string, approved: boolean): Promise<void> {
  const channelId = getAdminConfirmChannelId();
  if (!channelId) return;
  await editDiscordMessage(channelId, messageId, {
    embeds: [
      {
        title: "Змінити сезон галереї?",
        description: resultText,
        color: approved ? 0x4caf50 : 0xff5555,
      },
    ],
    components: [],
  });
}
