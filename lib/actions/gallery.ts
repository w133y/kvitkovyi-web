"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGalleryUploadTarget, type GalleryUploadTarget } from "@/lib/r2";
import { postGalleryModeration, postSeasonChangeConfirm } from "@/lib/gallery-discord";
import { logError } from "@/lib/admin-log";
import { revalidatePath } from "next/cache";
import type { GalleryPhoto } from "@prisma/client";

const SITE_DAILY_LIMIT = 3;

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function countSubmittedToday(userId: string): Promise<number> {
  return prisma.galleryPhoto.count({
    where: { submittedByUserId: userId, source: "SITE", createdAt: { gte: startOfTodayUtc() } },
  });
}

export async function getGallerySettings() {
  return prisma.gallerySettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export type UploadTargetResult = ({ ok: true } & GalleryUploadTarget) | { error: string };

// Step 1 of 2 for the site submission form (see finalizeGalleryPhotoSubmission
// below for step 2). The photo itself is never sent through a server action
// — Vercel's serverless functions hard-cap request bodies at 4.5MB at the
// platform level (next.config.ts's own bodySizeLimit only governs Next's
// own check on top of that, it can't raise Vercel's own ceiling), so a real
// phone photo routinely failed with a 413 before any of our code even ran.
// The browser instead PUTs the file straight to R2 using the presigned URL
// this hands back, then calls finalizeGalleryPhotoSubmission with just the
// resulting URL — a few bytes of JSON, nowhere near the limit.
export async function getGalleryUploadTarget(contentType: string): Promise<UploadTargetResult> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти через Discord" };
  if (!contentType.startsWith("image/")) return { error: "Файл має бути зображенням" };

  const submittedToday = await countSubmittedToday(session.user.id);
  if (submittedToday >= SITE_DAILY_LIMIT) {
    return { error: `Ви вже запропонували ${SITE_DAILY_LIMIT} фото сьогодні — спробуйте завтра` };
  }

  try {
    return { ok: true, ...(await createGalleryUploadTarget(contentType)) };
  } catch (err) {
    await logError("getGalleryUploadTarget: failed", err);
    return { error: "Не вдалося підготувати завантаження" };
  }
}

export type FinalizeGalleryPhotoInput = {
  url: string;
  key: string;
  description?: string;
  season?: number;
  author?: string;
};

export type SubmitGalleryPhotoResult = { ok: true } | { error: string };

// Step 2: the photo is already on R2 (uploaded directly from the browser)
// by the time this runs — creates the DB row and posts it to the
// moderation channel. Re-checks the daily limit rather than trusting the
// client not to call this directly after reusing an old upload target.
export async function finalizeGalleryPhotoSubmission(input: FinalizeGalleryPhotoInput): Promise<SubmitGalleryPhotoResult> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти через Discord" };

  const submittedToday = await countSubmittedToday(session.user.id);
  if (submittedToday >= SITE_DAILY_LIMIT) {
    return { error: `Ви вже запропонували ${SITE_DAILY_LIMIT} фото сьогодні — спробуйте завтра` };
  }

  // The url must actually be one our own R2 bucket just handed back —
  // otherwise this endpoint would let anyone register an arbitrary
  // external image URL as a "submission" with nothing ever touching R2 (or
  // our upload target) at all.
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!input.url || !input.key || !publicUrl || input.url !== `${publicUrl}/${input.key}`) {
    return { error: "Невірне джерело фото" };
  }

  const settings = await getGallerySettings();
  // Locked means locked — never trust the client's season value while an
  // admin has it locked, even if the field was somehow re-enabled/edited
  // client-side.
  const season =
    !settings.seasonLocked && Number.isFinite(input.season) && (input.season as number) > 0
      ? Math.floor(input.season as number)
      : settings.currentSeason;

  const description = input.description?.trim() || null;
  const author = input.author?.trim() || null;

  const photo = await prisma.galleryPhoto.create({
    data: {
      url: input.url,
      storageKey: input.key,
      description,
      author,
      season,
      source: "SITE",
      submittedByUserId: session.user.id,
    },
  });

  const discordMessageId = await postGalleryModeration(photo);
  if (discordMessageId) {
    await prisma.galleryPhoto.update({ where: { id: photo.id }, data: { discordMessageId } });
  }

  revalidatePath("/");
  revalidatePath("/gallery");
  return { ok: true };
}

// --- Daily rotation ---
// 10 photos a day: 7 drawn from the ~50 most recently approved ("new"),
// 3 drawn from the full approved pool ("any" — could coincidentally also
// be recent, that's fine, they just aren't required to be). Seeded by
// today's UTC date so every visitor sees the same set all day, and it
// changes on its own at the day boundary without any cron job.

const RECENT_POOL_SIZE = 50;
const DAILY_TOTAL = 10;
const DAILY_RECENT_COUNT = 7;

function seededRandom(seed: number): () => number {
  // mulberry32 — small, fast, deterministic for a given seed.
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function todayUtcSeed(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

export async function getTodayGallery(): Promise<GalleryPhoto[]> {
  const approved = await prisma.galleryPhoto.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    take: 500, // generous cap — this is the whole approved pool for the "any" draw
  });
  if (approved.length === 0) return [];

  const recentPool = approved.slice(0, RECENT_POOL_SIZE);
  const seed = hashString(todayUtcSeed());
  const rand = seededRandom(seed);

  const recentPicks = seededShuffle(recentPool, rand).slice(0, Math.min(DAILY_RECENT_COUNT, recentPool.length));
  const pickedIds = new Set(recentPicks.map((p) => p.id));

  const remainingSlots = Math.min(DAILY_TOTAL, approved.length) - recentPicks.length;
  const anyPool = approved.filter((p) => !pickedIds.has(p.id));
  const anyPicks = seededShuffle(anyPool, rand).slice(0, Math.max(0, remainingSlots));

  return seededShuffle([...recentPicks, ...anyPicks], rand);
}

export type GallerySort = "date" | "season";

export async function getAllGalleryPhotos(sort: GallerySort = "date"): Promise<GalleryPhoto[]> {
  return prisma.galleryPhoto.findMany({
    where: { status: "APPROVED" },
    orderBy:
      sort === "season"
        ? [{ season: "desc" }, { approvedAt: "desc" }]
        : [{ approvedAt: "desc" }, { createdAt: "desc" }],
  });
}

// --- Admin: season ---

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
  return session;
}

export type ProposeSeasonChangeResult = { ok: true } | { error: string };

// Doesn't change GallerySettings.currentSeason itself — only records the
// proposal and posts a Yes/No confirmation to Discord. The interactions
// route applies it (or cancels it) when that message's button is clicked.
export async function proposeSeasonChange(newSeason: number): Promise<ProposeSeasonChangeResult> {
  const session = await requireAdmin();
  if (!Number.isFinite(newSeason) || newSeason <= 0) {
    return { error: "Невірний номер сезону" };
  }

  const settings = await getGallerySettings();
  if (settings.pendingSeason !== null) {
    return { error: "Уже є запит на зміну сезону, що очікує підтвердження в Discord" };
  }

  const adminName = session?.user?.name ?? "адмін";
  const messageId = await postSeasonChangeConfirm({ newSeason: Math.floor(newSeason), adminName });

  await prisma.gallerySettings.update({
    where: { id: "default" },
    data: {
      pendingSeason: Math.floor(newSeason),
      pendingSeasonMessageId: messageId,
      pendingSeasonAdminName: adminName,
    },
  });

  revalidatePath("/admin");
  return { ok: true };
}

// Simple on/off, unlike currentSeason itself — no Discord confirmation
// needed since this doesn't retroactively touch any data, just whether the
// submission form's season field is editable going forward.
export async function setSeasonLocked(locked: boolean): Promise<void> {
  await requireAdmin();
  await prisma.gallerySettings.upsert({
    where: { id: "default" },
    update: { seasonLocked: locked },
    create: { id: "default", seasonLocked: locked },
  });
  revalidatePath("/admin");
  revalidatePath("/");
}
