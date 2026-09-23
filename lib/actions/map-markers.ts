"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDiscordLink } from "@/lib/mc-db";
import { MARKER_DURATIONS, MARKER_LIMITS, validateMarker, type MarkerInput } from "@/lib/map-markers";
import { postMarkerModeration } from "@/lib/map-markers-discord";
import { fetchImageAsDataUri, uploadedDataUriToImage } from "@/lib/map-marker-image";

export type SuggestMarkerResult = { ok: true } | { error: string };

// A player suggests a BlueMap marker — stored PENDING and sent to the map
// channel for review. Anti-spam: signed in with a linked nickname, at most
// MARKER_LIMITS.maxPendingPerUser waiting at once, and a cooldown between
// suggestions.
// ponytail: the cooldown check and the insert aren't atomic, so two
// requests fired at the same instant could both pass — the form's disabled
// submit button covers the realistic case; add a DB-level lock if abused.
// The logo image arrives as either a file the browser read into a data: URI
// (iconUpload) or a link (iconUrl) — both are re-validated from their bytes
// here; input.iconImage from the client is never trusted directly.
export async function suggestMapMarker(
  input: MarkerInput & { iconUpload?: string | null; iconUrl?: string | null }
): Promise<SuggestMarkerResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const discordId = session?.user?.discordId;
  if (!userId || !discordId) return { error: "Увійдіть через Discord, щоб запропонувати мітку" };

  const link = await getDiscordLink(discordId);
  if (!link) return { error: "Спершу прив'яжіть нікнейм на сервері до Discord" };

  let iconImage: string | null = null;
  if (input.iconUpload) {
    const img = uploadedDataUriToImage(input.iconUpload);
    if (typeof img !== "string") return img;
    iconImage = img;
  } else if (input.iconUrl?.trim()) {
    const img = await fetchImageAsDataUri(input.iconUrl);
    if (typeof img !== "string") return img;
    iconImage = img;
  }

  const marker = validateMarker({ ...input, iconImage });
  if ("error" in marker) return marker;
  // Moderators may set any term via Discord; players pick from the form.
  if (!MARKER_DURATIONS.includes(marker.durationDays)) return { error: "Невідомий термін" };

  const [pending, last] = await Promise.all([
    prisma.mapMarker.count({ where: { submittedByUserId: userId, status: "PENDING" } }),
    prisma.mapMarker.findFirst({
      where: { submittedByUserId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (pending >= MARKER_LIMITS.maxPendingPerUser) {
    return { error: `У вас уже ${pending} мітки на перевірці — дочекайтесь рішення` };
  }
  if (last && Date.now() - last.createdAt.getTime() < MARKER_LIMITS.cooldownMs) {
    const minutes = Math.ceil((MARKER_LIMITS.cooldownMs - (Date.now() - last.createdAt.getTime())) / 60_000);
    return { error: `Наступну мітку можна запропонувати через ${minutes} хв` };
  }

  const created = await prisma.mapMarker.create({
    data: { ...marker, submittedByUserId: userId, nickname: link.nickname },
  });

  const messageId = await postMarkerModeration(created);
  if (messageId) {
    await prisma.mapMarker.update({ where: { id: created.id }, data: { discordMessageId: messageId } });
  }

  return { ok: true };
}
