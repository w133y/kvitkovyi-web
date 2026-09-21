"use server";

import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDiscordLink, getPlaytimeByNickname, searchPlayerNicknames, getUuidByNickname } from "@/lib/mc-db";
import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";
import { fetchRecentDonates } from "@/lib/donatello";
import { grantDonatePrivilegeInGame } from "@/lib/donate-privilege-grants";
import { logDonateOrderCreated, logDonateOrderPaid, logDonateOrderExpired } from "@/lib/donate-order-log";
import { logError } from "@/lib/admin-log";
import { calculateDonateAmount, MIN_DONATE_MONTHS, MAX_DONATE_MONTHS } from "@/lib/donate-pricing";
import { HEX_COLOR_RE } from "@/lib/minecraft-symbols";
import type { DonateOrder } from "@prisma/client";
import { revalidatePath } from "next/cache";

const PRIVILEGE_DURATION_DAYS_PER_MONTH = 30;

// A buyer's stuck on the payment page 10 minutes with no confirmed
// donation is almost certainly not going to pay — expiring the order frees
// its `code` up for a fresh attempt and stops it cluttering the resume
// prompt / admin log indefinitely.
const ORDER_TIMEOUT_MS = 10 * 60 * 1000;

function generateCode(): string {
  return "KV-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Opportunistic, same no-cron tradeoff as the DonatePrivilege expiry sweep
// (see lib/donate-privilege-grants.ts) — checked wherever an order is read
// or polled, not the instant the 10 minutes are up.
async function expireIfStale(order: DonateOrder): Promise<DonateOrder> {
  if (order.status !== "PENDING") return order;
  if (Date.now() - order.createdAt.getTime() < ORDER_TIMEOUT_MS) return order;

  const claim = await prisma.donateOrder.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  if (claim.count === 0) {
    // Paid (or expired by a concurrent request) in the meantime.
    return (await prisma.donateOrder.findUnique({ where: { id: order.id } })) ?? order;
  }

  const expired: DonateOrder = { ...order, status: "EXPIRED" };
  await logDonateOrderExpired(expired);
  return expired;
}

export type CreateDonateOrderInput = {
  tier: "FLORIST" | "MECENAT";
  iconSymbol?: string;
  iconColorHex?: string;
  // 1-6 months — validated below rather than trusted, since it drives the
  // charged amount. Defaults to 1 for any caller that predates this field.
  months?: number;
  // Gift the privilege to a different player than the buyer — must be a
  // real nickname known to the server, checked below. Omit (or match the
  // buyer's own nickname) to buy for yourself, the common case.
  recipientNickname?: string;
};

export type CreateDonateOrderResult = { orderId: string } | { error: string };

// Creates the PENDING order the payment page is built around — its `code`
// is what ties a Donatello donation back to this specific purchase (see
// checkDonateOrderPayment below).
export async function createDonateOrder(
  input: CreateDonateOrderInput
): Promise<CreateDonateOrderResult> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти через Discord" };
  if (!session.user.discordId) return { error: "Discord-акаунт не прив'язано" };

  const link = await getDiscordLink(session.user.discordId);
  if (!link) return { error: "До вашого Discord-акаунту не прив'язано нікнейм на сервері" };

  const months = Math.round(input.months ?? 1);
  if (!Number.isFinite(months) || months < MIN_DONATE_MONTHS || months > MAX_DONATE_MONTHS) {
    return { error: `Тривалість має бути від ${MIN_DONATE_MONTHS} до ${MAX_DONATE_MONTHS} місяців` };
  }

  // The builder's picker is a free hex input now, not a fixed swatch grid —
  // same value later lands in a raw console command (see safeHexColor in
  // lib/donate-privilege-grants.ts), so it's worth rejecting garbage here
  // too rather than relying on that fallback alone.
  if (input.tier === "MECENAT" && input.iconColorHex && !HEX_COLOR_RE.test(input.iconColorHex.trim())) {
    return { error: "Некоректний формат кольору" };
  }

  let recipientNickname = link.nickname;
  const requestedRecipient = input.recipientNickname?.trim();
  if (requestedRecipient && requestedRecipient.toLowerCase() !== link.nickname.toLowerCase()) {
    const exists = await getPlaytimeByNickname(requestedRecipient);
    if (!exists) return { error: "Гравця з таким ніком не знайдено" };
    recipientNickname = requestedRecipient;
  }

  // Collision odds are astronomically low (4 random bytes), but the column
  // is @unique so a retry is cheap insurance rather than a failed order.
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.donateOrder.findUnique({ where: { code } });
    if (!existing) break;
    code = generateCode();
  }

  const order = await prisma.donateOrder.create({
    data: {
      code,
      userId: session.user.id,
      nickname: recipientNickname,
      buyerNickname: link.nickname,
      tier: input.tier,
      iconSymbol: input.tier === "MECENAT" ? input.iconSymbol?.trim() || null : null,
      iconColorHex: input.tier === "MECENAT" ? input.iconColorHex?.trim() || null : null,
      months,
      amountUah: calculateDonateAmount(input.tier, months),
    },
  });

  const discordMessageId = await logDonateOrderCreated(order);
  if (discordMessageId) {
    await prisma.donateOrder.update({ where: { id: order.id }, data: { discordMessageId } });
  }

  return { orderId: order.id };
}

// Backs the recipient picker on the builder — any signed-in user can look
// up real nicknames (they're public everywhere else on the site too, e.g.
// the leaderboard), unlike the admin-only lookups in lib/actions/achievements.ts.
export async function searchDonateRecipients(query: string): Promise<string[]> {
  const session = await auth();
  if (!session?.user) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchPlayerNicknames(trimmed, 20);
}

export type RecipientSkin = { skinUrl: string; capeUrl: string | null; slim: boolean };

// Lets the builder's skin preview actually show the gifted player, not just
// their name in the picker pill — looks up their uuid (nicknames aren't
// stored on the skin texture cache) then reuses the same Mojang lookup the
// buyer's own preview is seeded with.
export async function getRecipientSkin(nickname: string): Promise<RecipientSkin | { error: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти через Discord" };

  const uuid = await getUuidByNickname(nickname.trim());
  if (!uuid) return { error: "Гравця не знайдено" };

  const texture = (await getSkinTexture(uuid)) ?? STEVE_SKIN;
  return { skinUrl: texture.skinUrl, capeUrl: texture.capeUrl, slim: texture.slim };
}

// Read for the payment page — scoped to the order's own owner so one buyer
// can't view/poll another's order by guessing an id.
export async function getDonateOrder(orderId: string) {
  const session = await auth();
  if (!session?.user) return null;
  const order = await prisma.donateOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== session.user.id) return null;
  return expireIfStale(order);
}

const RESUMABLE_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ResumableDonateOrder = {
  id: string;
  tier: "FLORIST" | "MECENAT";
  amountUah: number;
};

// Backs the site-wide "resume payment?" prompt — the most recent order this
// user started but never finished, as long as it's recent enough that
// resuming it still makes sense (an order from weeks ago is more likely
// abandoned on purpose than forgotten).
export async function getResumableDonateOrder(): Promise<ResumableDonateOrder | null> {
  const session = await auth();
  if (!session?.user) return null;

  const order = await prisma.donateOrder.findFirst({
    where: {
      userId: session.user.id,
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - RESUMABLE_ORDER_MAX_AGE_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, tier: true, amountUah: true },
  });
  return order;
}

export type CheckDonateOrderResult = { status: "PENDING" | "PAID" | "EXPIRED" } | { error: string };

// Polled from the payment page (client component) every few seconds while
// it's open — there's no Donatello webhook, so confirmation only happens
// while someone is actually waiting on this page.
export async function checkDonateOrderPayment(orderId: string): Promise<CheckDonateOrderResult> {
  const session = await auth();
  if (!session?.user) return { error: "Потрібно увійти" };

  let order = await prisma.donateOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== session.user.id) return { error: "Замовлення не знайдено" };
  if (order.status === "PAID") return { status: "PAID" };

  order = await expireIfStale(order);
  if (order.status === "EXPIRED") return { status: "EXPIRED" };

  let donates;
  try {
    donates = await fetchRecentDonates(30);
  } catch {
    // Transient Donatello API hiccup — just report "still pending" and let
    // the next poll try again rather than surfacing an error to the buyer.
    return { status: "PENDING" };
  }

  const match = donates.find(
    (d) => d.currency === "UAH" && Number(d.amount) >= order.amountUah && d.message.includes(order.code)
  );
  if (!match) return { status: "PENDING" };

  // Atomic PENDING -> PAID claim, guarding against two concurrent polls
  // (e.g. the same payment page open in two tabs) both trying to grant the
  // privilege for this one order.
  const paidAt = new Date();
  let claim;
  try {
    claim = await prisma.donateOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "PAID", paidAt, donatelloPubId: match.pubId },
    });
  } catch (err) {
    // donatelloPubId is @unique — this would only throw if that same
    // donation somehow got claimed by another order first, which the
    // per-order random code should make effectively impossible.
    await logError("checkDonateOrderPayment: claim failed", err);
    return { status: "PENDING" };
  }
  if (claim.count === 0) {
    const fresh = await prisma.donateOrder.findUnique({ where: { id: order.id } });
    return { status: fresh?.status === "PAID" ? "PAID" : "PENDING" };
  }

  try {
    await prisma.donatePrivilege.create({
      data: {
        nickname: order.nickname,
        tier: order.tier,
        iconSymbol: order.iconSymbol,
        iconColorHex: order.iconColorHex,
        expiresAt: new Date(Date.now() + order.months * PRIVILEGE_DURATION_DAYS_PER_MONTH * 24 * 60 * 60 * 1000),
      },
    });
  } catch (err) {
    // Order is already marked PAID above, so the buyer isn't stuck even if
    // this fails — but it needs manual follow-up (grant via /admin).
    await logError("checkDonateOrderPayment: privilege grant failed after marking paid", err);
  }

  // The actual in-game grant — DonatePrivilege above only drives the site's
  // own badge, it never touches LuckPerms.
  await grantDonatePrivilegeInGame({
    nickname: order.nickname,
    tier: order.tier,
    iconSymbol: order.iconSymbol,
    iconColorHex: order.iconColorHex,
  });

  await logDonateOrderPaid({ ...order, status: "PAID", paidAt, donatelloPubId: match.pubId });

  revalidatePath(`/profile/${order.nickname}`);
  return { status: "PAID" };
}
