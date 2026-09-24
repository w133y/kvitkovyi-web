"use server";

import { auth } from "@/lib/auth";
import { getDiscordLink } from "@/lib/mc-db";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Pronoun } from "@/lib/format-last-seen";
import { BIO_LINK_ERROR, bioContainsLink } from "@/lib/bio-links";

const VALID_PRONOUNS = new Set<Pronoun>(["he", "she", "they"]);

const MAX_BIO_LENGTH = 160;

// A bare handle like "twitch.tv/name" is fine to type but not a valid href
// on its own — assume https when no protocol was given rather than reject it.
function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Only checks it's actually a twitch.tv/<channel> URL, not that the channel
// exists — same shape Twitch itself requires for a username (4-25 chars,
// letters/digits/underscore, can't start with a digit).
function isValidTwitchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./i, "").toLowerCase() !== "twitch.tv") return false;
    const handle = u.pathname.replace(/^\/+|\/+$/g, "");
    return /^[a-zA-Z][a-zA-Z0-9_]{3,24}$/.test(handle);
  } catch {
    return false;
  }
}

// YouTube channel URLs come in several legitimate shapes (@handle,
// /channel/UC..., /c/Name, /user/Name) — this only checks the domain is
// really youtube.com/youtu.be and there's some non-empty path, rather than
// trying to fully model every valid form.
function isValidYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./i, "").toLowerCase();
    if (host === "youtu.be") return u.pathname.replace(/^\/+/, "").length > 0;
    if (host !== "youtube.com") return false;
    return u.pathname.replace(/^\/+|\/+$/g, "").length > 0;
  } catch {
    return false;
  }
}

// Single save for the whole profile editor (bio + Discord visibility +
// Twitch/YouTube links) — one button now covers all of it, so one action
// call covers all of it too. Same ownership check as before: only the
// account whose current Discord link resolves to this exact nickname may
// edit it, verified server-side regardless of what the client sent.
export async function updateProfile(
  nickname: string,
  data: {
    bio: string;
    showDiscord: boolean;
    twitchUrl: string;
    youtubeUrl: string;
    pronoun: string;
  }
) {
  const session = await auth();
  if (!session?.user?.discordId) {
    throw new Error("Потрібно увійти через Discord");
  }

  const link = await getDiscordLink(session.user.discordId);
  if (!link || link.nickname !== nickname) {
    throw new Error("Немає доступу до редагування цього профілю");
  }

  const twitchUrl = normalizeUrl(data.twitchUrl);
  if (twitchUrl && !isValidTwitchUrl(twitchUrl)) {
    throw new Error("Невірне посилання на Twitch");
  }

  const youtubeUrl = normalizeUrl(data.youtubeUrl);
  if (youtubeUrl && !isValidYoutubeUrl(youtubeUrl)) {
    throw new Error("Невірне посилання на YouTube");
  }

  const pronoun = VALID_PRONOUNS.has(data.pronoun as Pronoun) ? data.pronoun : null;

  const trimmedBio = data.bio.trim().slice(0, MAX_BIO_LENGTH);
  if (bioContainsLink(trimmedBio)) {
    throw new Error(BIO_LINK_ERROR);
  }
  if (trimmedBio.length === 0) {
    await prisma.playerBio.deleteMany({ where: { nickname } });
  } else {
    await prisma.playerBio.upsert({
      where: { nickname },
      create: { nickname, bio: trimmedBio },
      update: { bio: trimmedBio },
    });
  }

  await prisma.user.update({
    where: { discordId: session.user.discordId },
    data: {
      showDiscord: data.showDiscord,
      twitchUrl,
      youtubeUrl,
      pronoun,
    },
  });

  revalidatePath(`/profile/${nickname}`);
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Доступ заборонено");
}

// /admin → "Описи гравців"
export async function listPlayerBios(): Promise<{ nickname: string; bio: string }[]> {
  await requireAdmin();
  return prisma.playerBio.findMany({ select: { nickname: true, bio: true }, orderBy: { updatedAt: "desc" } });
}

export async function clearPlayerBio(nickname: string): Promise<void> {
  await requireAdmin();
  await prisma.playerBio.deleteMany({ where: { nickname } });
  revalidatePath(`/profile/${nickname}`);
}
