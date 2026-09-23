// Discord Interactions HTTP endpoint — handles the /gallery slash command
// and every button/modal click posted by lib/gallery-discord.ts (the
// moderation queue), lib/actions/gallery.ts (the season-change
// confirmation) and lib/map-markers-discord.ts (map marker review). Registered as this app's "Interactions Endpoint URL" in
// the Discord Developer Portal; Discord POSTs every interaction here
// instead of us needing a persistent gateway bot connection.

import nacl from "tweetnacl";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteGalleryPhoto, uploadR2Object } from "@/lib/r2";
import { editInteractionResponse } from "@/lib/discord";
import { logError } from "@/lib/admin-log";
import { updateMarkerModeration } from "@/lib/map-markers-discord";
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

// ADMINISTRATOR | MANAGE_GUILD | MANAGE_MESSAGES — no dedicated "gallery
// staff" role is configured, so anyone with general moderation-ish
// permissions on the server can run the moderation buttons.
const MODERATOR_PERMISSION_MASK =
  (BigInt(1) << BigInt(3)) | (BigInt(1) << BigInt(5)) | (BigInt(1) << BigInt(13));

function isModerator(interaction: { member?: { permissions?: string } }): boolean {
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

  if (!verifySignature(body, signature, timestamp)) {
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

async function handleGalleryCommand(interaction: any) {
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
      const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      const key = `gallery/discord-${interaction.id}.${ext}`;
      const url = await uploadR2Object(key, body, contentType);

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

  return ephemeral("Невідома дія.");
}

async function handleSeasonConfirm(interaction: any, customId: string) {
  if (!isModerator(interaction)) {
    return ephemeral("🚫 У вас немає прав для цієї дії.");
  }

  const settings = await getGallerySettings();
  if (settings.pendingSeason === null || settings.pendingSeasonMessageId !== interaction.message?.id) {
    return ephemeral("Цей запит вже неактуальний.");
  }

  const approved = customId === "season:confirm:yes";
  if (approved) {
    await prisma.gallerySettings.update({
      where: { id: "default" },
      data: { currentSeason: settings.pendingSeason, pendingSeason: null, pendingSeasonMessageId: null, pendingSeasonAdminName: null },
    });
  } else {
    await prisma.gallerySettings.update({
      where: { id: "default" },
      data: { pendingSeason: null, pendingSeasonMessageId: null, pendingSeasonAdminName: null },
    });
  }

  await editSeasonChangeResult(
    interaction.message.id,
    approved
      ? `✅ Підтверджено — поточний сезон тепер **${settings.pendingSeason}**.`
      : `❌ Скасовано — сезон лишився **${settings.currentSeason}**.`,
    approved
  );

  return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
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
