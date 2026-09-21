// "Your privilege expires soon" Discord DM — the one place in this codebase
// that genuinely needs a real schedule rather than the opportunistic
// sweep-on-page-view tradeoff used everywhere else (lib/donate-privilege-grants.ts,
// lib/actions/donate-order.ts): nobody visiting the site is what triggers a
// reminder someone needs to see *before* their privilege lapses. Driven by
// app/api/cron/donate-reminders/route.ts on a daily Vercel Cron schedule
// (see vercel.json).

import { prisma } from "@/lib/prisma";
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

async function sendOneReminder(priv: DonatePrivilege): Promise<boolean> {
  const discordId = await getDiscordIdForNickname(priv.nickname);
  if (!discordId) return false;

  const dmChannelId = await getOrCreateDmChannel(discordId);
  if (!dmChannelId) return false;

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
  const renewUrl = `${getSiteUrl()}/shop/sponsorship?${params.toString()}`;

  const dateLabel = priv.expiresAt.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

  const messageId = await sendDiscordMessage(dmChannelId, {
    embeds: [
      {
        title: `Привілегія «${TIER_LABEL[priv.tier]}» скоро закінчується`,
        description: `Ваша привілегія **${TIER_LABEL[priv.tier]}** на сервері Квітковий закінчується **${dateLabel}**. Продовжіть її, щоб значок і роль не зникли.`,
        color: 0xffd139,
      },
    ],
    components: [
      {
        type: 1,
        components: [{ type: 2, style: 5, label: "Продовжити привілегію", url: renewUrl }],
      },
    ],
  });
  return messageId !== null;
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
    const ok = await sendOneReminder(priv);
    // Marked regardless of outcome — a failed DM (closed DMs, left the
    // server) isn't going to start succeeding on tomorrow's run either;
    // leaving it unmarked would just resend the attempt every day until
    // the privilege actually expires.
    await prisma.donatePrivilege.update({
      where: { id: priv.id },
      data: { reminderSentAt: now },
    });
    if (ok) sent++;
    else failed++;
  }

  return { checked: due.length, sent, failed };
}
