// "Your privilege expires soon" and "your privilege has ended" Discord DMs
// — the one place in this codebase
// that genuinely needs a real schedule rather than the opportunistic
// sweep-on-page-view tradeoff used everywhere else (lib/donate-privilege-grants.ts,
// lib/actions/donate-order.ts): nobody visiting the site is what triggers a
// reminder someone needs to see *before* their privilege lapses. Driven by
// app/api/cron/donate-reminders/route.ts on a daily Vercel Cron schedule
// (see vercel.json).

import { prisma } from "@/lib/prisma";
import { sweepExpiredDonatePrivileges } from "@/lib/donate-privilege-grants";
import { getDiscordIdForNickname } from "@/lib/mc-db";
import { getOrCreateDmChannel, sendDiscordMessage } from "@/lib/discord";
import { FLORIST_SYMBOL, FLORIST_COLOR_HEX } from "@/lib/minecraft-symbols";
import type { DonatePrivilege } from "@prisma/client";

const TIER_LABEL = { FLORIST: "Флорист", MECENAT: "Меценат" } as const;

function getSiteUrl(): string {
  return process.env.SITE_URL || "http://localhost:3000";
}

// A daily cron only needs to look ~24h ahead, but a little slack (36h)
// covers a run that's late or briefly down without letting a privilege slip
// through the gap unreminded — reminderSentAt is what actually prevents a
// double-send across two runs that both catch the same row.
const LOOKAHEAD_MS = 36 * 60 * 60 * 1000;

// Only notices older than this are skipped outright, so enabling the
// "ended" DM doesn't message everyone whose privilege lapsed months ago.
const EXPIRED_NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// The site runs in UTC; players read dates in Kyiv time.
function formatKyiv(date: Date): string {
  return date.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// A renewal creates a new row rather than extending the old one — so a row
// whose player already has a later-ending active privilege needs neither the
// "expires soon" nor the "has ended" DM.
async function hasLaterActivePrivilege(priv: DonatePrivilege): Promise<boolean> {
  const later = await prisma.donatePrivilege.findFirst({
    where: { nickname: priv.nickname, revokedAt: null, id: { not: priv.id }, expiresAt: { gt: priv.expiresAt } },
    select: { id: true },
  });
  return later !== null;
}

function renewUrlFor(priv: DonatePrivilege): string {
  // Same "MECENAT with no custom pick falls back to the Флорист look"
  // convention used on the profile badge (app/(site)/profile/[nickname]/page.tsx)
  // and the donate builder's own preview.
  const symbol = priv.tier === "MECENAT" ? priv.iconSymbol || FLORIST_SYMBOL : FLORIST_SYMBOL;
  const colorHex = priv.tier === "MECENAT" ? priv.iconColorHex || FLORIST_COLOR_HEX : FLORIST_COLOR_HEX;

  const params = new URLSearchParams({ tier: priv.tier.toLowerCase() });
  if (priv.tier === "MECENAT") {
    params.set("symbol", symbol);
    params.set("color", colorHex);
  }
  return `${getSiteUrl()}/shop/sponsorship?${params.toString()}`;
}

async function dmPlayer(
  priv: DonatePrivilege,
  embed: { title: string; description: string; color: number },
  buttonLabel: string
): Promise<boolean> {
  const discordId = await getDiscordIdForNickname(priv.nickname);
  if (!discordId) return false;

  const dmChannelId = await getOrCreateDmChannel(discordId);
  if (!dmChannelId) return false;

  const messageId = await sendDiscordMessage(dmChannelId, {
    embeds: [embed],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: buttonLabel, url: renewUrlFor(priv) }] }],
  });
  return messageId !== null;
}

function sendOneReminder(priv: DonatePrivilege): Promise<boolean> {
  return dmPlayer(
    priv,
    {
      title: `Привілегія «${TIER_LABEL[priv.tier]}» скоро закінчується`,
      description: `Ваша привілегія **${TIER_LABEL[priv.tier]}** на сервері Квітковий закінчується **${formatKyiv(priv.expiresAt)}**. Продовжіть її, щоб значок і роль не зникли — новий термін додасться до поточного.`,
      color: 0xffd139,
    },
    "Продовжити привілегію"
  );
}

function sendOneExpiredNotice(priv: DonatePrivilege): Promise<boolean> {
  return dmPlayer(
    priv,
    {
      title: `Привілегія «${TIER_LABEL[priv.tier]}» закінчилась`,
      description: `Термін вашої привілегії **${TIER_LABEL[priv.tier]}** на сервері Квітковий минув ${formatKyiv(priv.expiresAt)} — значок і роль знято. Дякуємо за підтримку сервера! Відновити привілегію можна будь-коли.`,
      color: 0xff5555,
    },
    "Відновити привілегію"
  );
}

export async function sendExpiryReminders(): Promise<{ checked: number; sent: number; failed: number }> {
  const now = new Date();
  const due = await prisma.donatePrivilege.findMany({
    where: {
      revokedAt: null,
      reminderSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + LOOKAHEAD_MS) },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const priv of due) {
    const ok = (await hasLaterActivePrivilege(priv)) ? null : await sendOneReminder(priv);
    // Marked regardless of outcome — a failed DM (closed DMs, left the
    // server) isn't going to start succeeding on tomorrow's run either;
    // leaving it unmarked would just resend the attempt every day until
    // the privilege actually expires.
    await prisma.donatePrivilege.update({
      where: { id: priv.id },
      data: { reminderSentAt: now },
    });
    if (ok) sent++;
    else if (ok === false) failed++;
  }

  return { checked: due.length, sent, failed };
}

// "Your privilege has ended" — revokes lapsed privileges in-game first (the
// same sweep profile/admin pages trigger opportunistically), so the DM is
// only sent once the role/badge are actually gone.
export async function sendExpiredNotices(): Promise<{ checked: number; sent: number; failed: number }> {
  await sweepExpiredDonatePrivileges();

  const now = new Date();
  const due = await prisma.donatePrivilege.findMany({
    where: {
      expiredNoticeSentAt: null,
      expiresAt: { lte: now, gt: new Date(now.getTime() - EXPIRED_NOTICE_MAX_AGE_MS) },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const priv of due) {
    const ok = (await hasLaterActivePrivilege(priv)) ? null : await sendOneExpiredNotice(priv);
    await prisma.donatePrivilege.update({ where: { id: priv.id }, data: { expiredNoticeSentAt: now } });
    if (ok) sent++;
    else if (ok === false) failed++;
  }

  return { checked: due.length, sent, failed };
}
