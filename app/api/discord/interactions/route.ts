// Discord Interactions HTTP endpoint — handles the /gallery slash command
// and every button/modal click posted by lib/gallery-discord.ts (the
// moderation queue) and lib/actions/gallery.ts (the season-change
// confirmation). Registered as this app's "Interactions Endpoint URL" in
// the Discord Developer Portal; Discord POSTs every interaction here
// instead of us needing a persistent gateway bot connection.

import nacl from "tweetnacl";
import { prisma } from "@/lib/prisma";
import { deleteGalleryPhoto } from "@/lib/r2";
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
  if (!String(attachment.content_type ?? "").startsWith("image/")) {
    return ephemeral("Файл має бути зображенням.");
  }

  const discordUserId: string | undefined = interaction.member?.user?.id ?? interaction.user?.id;
  const settings = await getGallerySettings();
  const season = Number.isFinite(seasonOption) && (seasonOption as number) > 0 ? Math.floor(seasonOption as number) : settings.currentSeason;

  const photo = await prisma.galleryPhoto.create({
    data: {
      url: attachment.url,
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

  return ephemeral("Дякуємо! Фото надіслано на модерацію 🌸");
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
