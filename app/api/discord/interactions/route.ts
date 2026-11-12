// Discord interactions handler — /gallery, the "Додати в галерею" message
// command, and every
// button/modal click posted by lib/gallery-discord.ts (the moderation
// queue), lib/actions/gallery.ts (the season-change confirmation),
// lib/map-markers-discord.ts (map marker review) and lib/site-admins.ts.
// The gateway bot (bot/index.mjs) receives them and POSTs them here; signed
// requests straight from Discord (an "Interactions Endpoint URL" set in the
// Developer Portal) still work too.

import nacl from "tweetnacl";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteGalleryPhoto, uploadGalleryImage } from "@/lib/r2";
import { editDiscordMessage, editInteractionResponse, sendDiscordMessage } from "@/lib/discord";
import { startNextSeason } from "@/lib/seasons";
import { checkActivePlayer } from "@/lib/active-players";
import { castSuggestionVote, countSuggestionVotes, suggestionVoteButtons } from "@/lib/suggestions";
import { logError } from "@/lib/admin-log";
import { updateMarkerModeration } from "@/lib/map-markers-discord";
import { SITE_ADMINS_CHANNEL_ID, addSiteAdmin, buildAdminPanel, isDiscordAdministrator, removeSiteAdmin } from "@/lib/site-admins";
import { MARKER_TYPES, validateMarker } from "@/lib/map-markers";

const DAY_MS = 86_400_000;
import type { MapMarkerType } from "@prisma/client";
import { postGalleryModeration, updateGalleryModeration, editSeasonChangeResult } from "@/lib/gallery-discord";
import { getGallerySettings } from "@/lib/actions/gallery";
import type { GalleryPhoto } from "@prisma/client";

export const runtime = "nodejs";

// Discord interaction/response type numbers (v10).
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;

const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;
const DEFERRED_UPDATE_MESSAGE = 6;
const UPDATE_MESSAGE = 7;
const MODAL = 9;

const EPHEMERAL = 64;

function ephemeral(content: string) {
  return Response.json({ type: CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: EPHEMERAL } });
}

function verifySignature(body: string, signature: string | null, timestamp: string | null): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
  } catch {
    return false;
  }
}

// The bot has no Discord signature to pass on — it proves itself with the
// shared CRON_SECRET instead (never accepted when that's unset).
function isFromBot(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

// Anyone with general moderation-ish permissions on the server
// (ADMINISTRATOR | MANAGE_GUILD | MANAGE_MESSAGES) or the Садівник role can
// run the moderation buttons. The site-admin panel has its own, stricter check.
const GARDENER_ROLE_ID = "1566876937274663002";
const MODERATOR_PERMISSION_MASK =
  (BigInt(1) << BigInt(3)) | (BigInt(1) << BigInt(5)) | (BigInt(1) << BigInt(13));

function isModerator(interaction: { member?: { permissions?: string; roles?: string[] } }): boolean {
  if (interaction.member?.roles?.includes(GARDENER_ROLE_ID)) return true;
  const raw = interaction.member?.permissions;
  if (!raw) return false;
  try {
    return (BigInt(raw) & MODERATOR_PERMISSION_MASK) !== BigInt(0);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!isFromBot(request) && !verifySignature(body, signature, timestamp)) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === PING) {
    return Response.json({ type: PONG });
  }

  if (interaction.type === APPLICATION_COMMAND) {
    return handleGalleryCommand(interaction);
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    return handleComponent(interaction);
  }

  if (interaction.type === MODAL_SUBMIT) {
    return handleModalSubmit(interaction);
  }

  return new Response("unhandled interaction type", { status: 400 });
}

// --- /gallery slash command — unlimited, no daily cap (see lib/actions/gallery.ts) ---
//
// Slash-command attachments live under cdn.discordapp.com/ephemeral-
// attachments and expire within hours — storing that URL (as this used to)
// left every Discord-submitted photo a dead link by the time it was
// reviewed. So the photo is copied into R2, like site uploads. That plus the
// moderation post doesn't reliably fit Discord's 3s reply window, so the
// reply is deferred and the work finishes in after().

const GALLERY_MAX_BYTES = 10 * 1024 * 1024;

// Message context-menu command ("Apps" on a message) — sends a photo someone
// already posted, instead of attaching it again (registered by bot/index.mjs).
const GALLERY_MESSAGE_COMMAND = "Додати в галерею";

async function handleGalleryCommand(interaction: any) {
  if (interaction.data?.name === GALLERY_MESSAGE_COMMAND) {
    const message = interaction.data.resolved?.messages?.[interaction.data.target_id];
    const attachment = message?.attachments?.find((a: any) => String(a.content_type ?? "").startsWith("image/"));
    if (!attachment) return ephemeral("У цьому повідомленні немає зображення.");
    const text = String(message.content ?? "").trim().slice(0, 300);
    const author = String(message.author?.global_name || message.author?.username || "").slice(0, 40);
    return submitGalleryPhoto(interaction, attachment, text || undefined, undefined, author || null);
  }

  if (interaction.data?.name !== "gallery") {
    return ephemeral("Невідома команда.");
  }

  const options: any[] = interaction.data.options ?? [];
  const attachmentId = options.find((o) => o.name === "photo")?.value;
  const description: string | undefined = options.find((o) => o.name === "description")?.value;
  const seasonOption: number | undefined = options.find((o) => o.name === "season")?.value;

  const attachment = interaction.data.resolved?.attachments?.[attachmentId];
  if (!attachment) {
    return ephemeral("Не знайдено фото — спробуйте ще раз.");
  }
  return submitGalleryPhoto(interaction, attachment, description, seasonOption, null);
}

async function submitGalleryPhoto(
  interaction: any,
  attachment: any,
  description: string | undefined,
  seasonOption: number | undefined,
  author: string | null
) {
  const contentType = String(attachment.content_type ?? "");
  if (!contentType.startsWith("image/")) {
    return ephemeral("Файл має бути зображенням.");
  }
  if (Number(attachment.size) > GALLERY_MAX_BYTES) {
    return ephemeral("Фото завелике — максимум 10 МБ.");
  }

  const discordUserId: string | undefined = interaction.member?.user?.id ?? interaction.user?.id;

  after(async () => {
    let reply = "Дякуємо! Фото надіслано на модерацію 🌸";
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`attachment download ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      const { url, key } = await uploadGalleryImage(`gallery/discord-${interaction.id}`, body, contentType);

      const settings = await getGallerySettings();
      const season =
        Number.isFinite(seasonOption) && (seasonOption as number) > 0
          ? Math.floor(seasonOption as number)
          : settings.currentSeason;

      const photo = await prisma.galleryPhoto.create({
        data: {
          url,
          storageKey: key,
          description: description?.trim() || null,
          author,
          season,
          source: "DISCORD",
          submittedByDiscordId: discordUserId ?? null,
        },
      });

      const messageId = await postGalleryModeration(photo);
      if (messageId) {
        await prisma.galleryPhoto.update({ where: { id: photo.id }, data: { discordMessageId: messageId } });
      }
    } catch (err) {
      await logError("discord /gallery: failed to store photo", err);
      reply = "Не вдалося зберегти фото — спробуйте ще раз.";
    }
    await editInteractionResponse(interaction.application_id, interaction.token, reply);
  });

  return Response.json({ type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: EPHEMERAL } });
}

// --- Buttons: gallery moderation + season confirm ---

async function handleComponent(interaction: any) {
  const customId: string = interaction.data?.custom_id ?? "";

  if (customId.startsWith("season:confirm:")) {
    return handleSeasonConfirm(interaction, customId);
  }

  if (customId.startsWith("gallery:")) {
    return handleGalleryButton(interaction, customId);
  }

  if (customId.startsWith("marker:")) {
    return handleMarkerComponent(interaction, customId);
  }

  if (customId.startsWith("siteadmin:")) {
    return handleSiteAdminComponent(interaction, customId);
  }

  if (customId.startsWith("suggest:")) {
    return handleSuggestionVote(interaction, customId);
  }

  return ephemeral("Невідома дія.");
}

async function handleSeasonConfirm(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }

  // Claiming the request clears it, so a double click can't start two season changes.
  const claimed = await prisma.gallerySettings.updateMany({
    where: { id: "default", pendingSeasonMessageId: interaction.message?.id, pendingSeason: { not: null } },
    data: { pendingSeason: null, pendingSeasonMessageId: null, pendingSeasonAdminName: null },
  });
  if (claimed.count === 0) {
    return ephemeral("Цей запит вже неактуальний.");
  }

  if (customId !== "season:confirm:yes") {
    const settings = await getGallerySettings();
    await editSeasonChangeResult(interaction.message.id, `❌ Скасовано — сезон лишився **${settings.currentSeason}**.`, false);
    return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
  }

  // The snapshot reads every player from the Minecraft DB — well past
  // Discord's 3s reply window, so it finishes in after().
  await editSeasonChangeResult(interaction.message.id, "⏳ Зберігаю статистику й починаю новий сезон…", true);
  after(async () => {
    let text: string;
    try {
      text = await startNextSeason();
    } catch (err) {
      await logError("seasons: season change failed", err);
      text = `❌ Сезон не змінено: ${err instanceof Error ? err.message : String(err)}. Можна запропонувати ще раз.`;
    }
    await editSeasonChangeResult(interaction.message.id, text, !text.startsWith("❌"));
  });
  return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
}

// --- Suggestion votes (lib/suggestions.ts) ---

// The eligibility check reads the Minecraft DB, so the reply is deferred and
// finished in after(), like /gallery.
async function handleSuggestionVote(interaction: any, customId: string) {
  const userId: string | undefined = interaction.member?.user?.id;
  const messageId: string | undefined = interaction.message?.id;
  if (!userId || !messageId) return ephemeral("Невідома дія.");
  const up = customId === "suggest:up";

  after(async () => {
    let reply: string;
    try {
      const check = await checkActivePlayer(userId);
      if (!check.ok) {
        reply = `🚫 Голосувати можуть лише активні гравці: ${check.reason}`;
      } else {
        const result = await castSuggestionVote(messageId, userId, up);
        const counts = await countSuggestionVotes(messageId);
        await editDiscordMessage(interaction.channel_id, messageId, { components: suggestionVoteButtons(counts.up, counts.down) });
        reply = result === "removed" ? "Голос знято." : up ? "👍 Голос «За» зараховано." : "👎 Голос «Проти» зараховано.";
      }
    } catch (err) {
      await logError("suggestions: vote failed", err);
      reply = "Не вдалося зарахувати голос — спробуй ще раз.";
    }
    await editInteractionResponse(interaction.application_id, interaction.token, reply);
  });

  return Response.json({ type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: EPHEMERAL } });
}

async function handleGalleryButton(interaction: any, customId: string) {
  const [, action, photoId] = customId.split(":");

  if (action === "edit_desc") {
    const photo = await prisma.galleryPhoto.findUnique({ where: { id: photoId } });
    if (!photo) return ephemeral("Фото не знайдено.");
    return Response.json({
      type: MODAL,
      data: {
        custom_id: `gallery:edit_desc_modal:${photoId}`,
        title: "Опис фото",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "description",
                style: 2,
                label: "Опис",
                value: photo.description ?? "",
                required: false,
                max_length: 300,
              },
            ],
          },
        ],
      },
    });
  }

  if (action === "edit_author") {
    const photo = await prisma.galleryPhoto.findUnique({ where: { id: photoId } });
    if (!photo) return ephemeral("Фото не знайдено.");
    return Response.json({
      type: MODAL,
      data: {
        custom_id: `gallery:edit_author_modal:${photoId}`,
        title: "Автор фото",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "author",
                style: 1,
                label: "Автор",
                value: photo.author ?? "",
                required: false,
                max_length: 40,
              },
            ],
          },
        ],
      },
    });
  }

  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }

  const photo = await prisma.galleryPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return ephemeral("Фото не знайдено.");

  let updated: GalleryPhoto;
  if (action === "approve") {
    updated = await prisma.galleryPhoto.update({
      where: { id: photoId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  } else if (action === "reject") {
    updated = await prisma.galleryPhoto.update({ where: { id: photoId }, data: { status: "REJECTED" } });
    if (photo.storageKey) await deleteGalleryPhoto(photo.storageKey);
  } else if (action === "toggle_desc") {
    updated = await prisma.galleryPhoto.update({
      where: { id: photoId },
      data: { showDescription: !photo.showDescription },
    });
  } else if (action === "toggle_author") {
    updated = await prisma.galleryPhoto.update({
      where: { id: photoId },
      data: { showAuthor: !photo.showAuthor },
    });
  } else {
    return ephemeral("Невідома дія.");
  }

  await updateGalleryModeration(updated);
  return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
}

// --- Modal submit: edit description ---

async function handleModalSubmit(interaction: any) {
  const customId: string = interaction.data?.custom_id ?? "";
  if (customId.startsWith("gallery:edit_desc_modal:")) {
    return handleEditDescModal(interaction, customId);
  }
  if (customId.startsWith("gallery:edit_author_modal:")) {
    return handleEditAuthorModal(interaction, customId);
  }
  if (customId.startsWith("marker:edit_modal:")) {
    return handleMarkerEditModal(interaction, customId);
  }
  return ephemeral("Невідома форма.");
}

async function handleEditDescModal(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }

  const photoId = customId.split(":")[2];
  const description: string =
    interaction.data.components?.[0]?.components?.[0]?.value?.trim() || "";

  const photo = await prisma.galleryPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return ephemeral("Фото не знайдено.");

  const updated = await prisma.galleryPhoto.update({
    where: { id: photoId },
    data: { description: description || null },
  });

  await updateGalleryModeration(updated);
  return ephemeral("✅ Опис оновлено.");
}

async function handleEditAuthorModal(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }

  const photoId = customId.split(":")[2];
  const author: string = interaction.data.components?.[0]?.components?.[0]?.value?.trim() || "";

  const photo = await prisma.galleryPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return ephemeral("Фото не знайдено.");

  const updated = await prisma.galleryPhoto.update({
    where: { id: photoId },
    data: { author: author || null },
  });

  await updateGalleryModeration(updated);
  return ephemeral("✅ Автора оновлено.");
}

// --- Map marker review (lib/map-markers-discord.ts) ---

async function handleMarkerComponent(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }
  const [, action, markerId] = customId.split(":");
  const marker = await prisma.mapMarker.findUnique({ where: { id: markerId } });
  if (!marker) return ephemeral("Мітку не знайдено.");

  if (action === "edit") {
    const field = (custom_id: string, label: string, style: 1 | 2, value: string, max: number, required: boolean) => ({
      type: 1,
      components: [{ type: 4, custom_id, label, style, value, max_length: max, required }],
    });
    return Response.json({
      type: MODAL,
      data: {
        custom_id: `marker:edit_modal:${marker.id}`,
        title: "Редагувати мітку",
        components: [
          field("label", "Назва", 1, marker.label, 40, true),
          field("description", "Опис", 2, marker.description ?? "", 300, false),
          field("discordInvite", "Discord міста (лише для міст)", 1, marker.discordInvite ?? "", 60, false),
          field("durationDays", "Термін у днях (порожньо — назавжди)", 1, marker.durationDays?.toString() ?? "", 3, false),
          field("color", "Колір обводки #RRGGBB (порожньо — як у типу)", 1, marker.color ?? "", 7, false),
        ],
      },
    });
  }

  let data: { status?: "APPROVED" | "REJECTED"; reviewedAt?: Date; expiresAt?: Date | null; type?: MapMarkerType };
  if (action === "approve") {
    // The term starts now, at approval — not when the player suggested it.
    const now = new Date();
    data = {
      status: "APPROVED",
      reviewedAt: now,
      expiresAt: marker.durationDays ? new Date(now.getTime() + marker.durationDays * DAY_MS) : null,
    };
  } else if (action === "reject") {
    data = { status: "REJECTED", reviewedAt: new Date() };
  } else if (action === "type") {
    const value = interaction.data?.values?.[0];
    if (!MARKER_TYPES.includes(value)) return ephemeral("Невідомий тип.");
    data = { type: value };
  } else {
    return ephemeral("Невідома дія.");
  }

  const updated = await prisma.mapMarker.update({ where: { id: marker.id }, data });
  await updateMarkerModeration(updated);
  return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
}

async function handleMarkerEditModal(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }
  const markerId = customId.split(":")[2];
  const marker = await prisma.mapMarker.findUnique({ where: { id: markerId } });
  if (!marker) return ephemeral("Мітку не знайдено.");

  const values: Record<string, string> = {};
  for (const row of interaction.data.components ?? []) {
    for (const c of row.components ?? []) values[c.custom_id] = c.value ?? "";
  }

  // Same validation as a player's suggestion — this text ends up in the map.
  const clean = validateMarker({
    label: values.label,
    type: marker.type,
    description: values.description,
    discordInvite: values.discordInvite,
    x: marker.x,
    y: marker.y,
    z: marker.z,
    durationDays: values.durationDays?.trim() ? Number(values.durationDays) : null,
    color: values.color ?? null,
    icon: marker.icon,
    iconImage: marker.iconImage,
  });
  if ("error" in clean) return ephemeral(`⚠️ ${clean.error}`);

  // An already-approved marker's expiry follows the edited term, counted
  // from its original approval.
  const expiresAt =
    marker.status === "APPROVED" && marker.reviewedAt && clean.durationDays
      ? new Date(marker.reviewedAt.getTime() + clean.durationDays * DAY_MS)
      : null;

  const updated = await prisma.mapMarker.update({
    where: { id: marker.id },
    data: {
      label: clean.label,
      description: clean.description,
      discordInvite: clean.discordInvite,
      durationDays: clean.durationDays,
      color: clean.color,
      expiresAt,
    },
  });
  await updateMarkerModeration(updated);
  return ephemeral("✅ Мітку оновлено.");
}

// --- Site admin panel (lib/site-admins.ts) ---

async function handleSiteAdminComponent(interaction: any, customId: string) {
  // Only in the admin channel, only for Discord ADMINISTRATORs — both come
  // from Discord's signed payload, not from anything the clicker can edit.
  if (interaction.channel_id !== SITE_ADMINS_CHANNEL_ID) return ephemeral("Ця панель працює лише в каналі адмінів.");
  if (!isDiscordAdministrator(interaction.member?.permissions)) {
    return ephemeral("🚫 Керувати адмінами сайту можуть лише адміністратори Discord-сервера.");
  }

  const actorId: string | undefined = interaction.member?.user?.id;
  const value: string | undefined = interaction.data?.values?.[0];
  if (!value) return ephemeral("Нічого не вибрано.");

  let result: { ok: string; discordId?: string | null } | { error: string };
  let targetId: string | null;
  if (customId === "siteadmin:add") {
    if (interaction.data?.resolved?.users?.[value]?.bot) return ephemeral("Бота не можна зробити адміном.");
    result = await addSiteAdmin(value);
    targetId = value;
  } else if (customId === "siteadmin:remove") {
    result = await removeSiteAdmin(value);
    targetId = "discordId" in result ? result.discordId ?? null : null;
  } else {
    return ephemeral("Невідома дія.");
  }
  if ("error" in result) return ephemeral(`⚠️ ${result.error}`);

  // Audit line in the channel (mentions shown, nobody pinged).
  await sendDiscordMessage(SITE_ADMINS_CHANNEL_ID, {
    content: `${customId === "siteadmin:add" ? "👑" : "🗑️"} <@${actorId}>: ${targetId ? `<@${targetId}>` : "користувач"} ${result.ok}.`,
    allowed_mentions: { parse: [] },
  });

  return Response.json({ type: UPDATE_MESSAGE, data: await buildAdminPanel() });
}
