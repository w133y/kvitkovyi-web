// Posts to the admin's Discord log channel about Флорист/Меценат orders and
// privileges: who wants to buy what and whether it's arrived (one message
// per order, edited PENDING -> PAID in place, see logDonateOrderCreated/Paid
// below), and separately when a privilege is taken away — either the expiry
// sweep or an admin's manual revoke in /admin (see logDonatePrivilegeRevoked,
// called from lib/donate-privilege-grants.ts).

import { sendDiscordMessage, editDiscordMessage, type DiscordEmbed } from "@/lib/discord";
import type { DonateOrder, DonateTier } from "@prisma/client";

const TIER_LABEL: Record<DonateTier, string> = {
  FLORIST: "Флорист",
  MECENAT: "Меценат",
};

const STATUS_LABEL: Record<DonateOrder["status"], string> = {
  PENDING: "⏳ Очікує оплати",
  PAID: "✅ Оплачено",
  EXPIRED: "❌ Час на оплату сплив (10 хв)",
};

const STATUS_COLOR: Record<DonateOrder["status"], number> = {
  PENDING: 0xffd139,
  PAID: 0x4caf50,
  EXPIRED: 0xff5555,
};

function buildOrderEmbed(order: DonateOrder): DiscordEmbed {
  const fields = [
    { name: "Гравець", value: order.nickname, inline: true },
    { name: "Привілей", value: TIER_LABEL[order.tier], inline: true },
    { name: "Сума", value: `${order.amountUah} ₴`, inline: true },
    { name: "Код", value: order.code, inline: true },
    { name: "Статус", value: STATUS_LABEL[order.status], inline: true },
  ];
  // Only shown when it's actually a gift — the common self-purchase case
  // would just repeat "Гравець" a second time for no reason.
  if (order.buyerNickname.toLowerCase() !== order.nickname.toLowerCase()) {
    fields.push({ name: "Купує", value: order.buyerNickname, inline: true });
  }
  if (order.tier === "MECENAT" && order.iconSymbol) {
    fields.push({ name: "Символ", value: order.iconSymbol, inline: true });
  }

  return {
    title: `Замовлення привілегії — ${TIER_LABEL[order.tier]}`,
    color: STATUS_COLOR[order.status],
    fields,
    timestamp: (order.paidAt ?? order.createdAt).toISOString(),
  };
}

function getLogChannelId(): string | null {
  const id = process.env.DISCORD_DONATE_LOG_CHANNEL_ID;
  if (!id) {
    console.error("donate-order-log: DISCORD_DONATE_LOG_CHANNEL_ID не налаштовано (перевірте .env)");
    return null;
  }
  return id;
}

// Posts the initial PENDING entry and returns its message id to store on
// the order — best-effort, a logging failure never blocks order creation.
export async function logDonateOrderCreated(order: DonateOrder): Promise<string | null> {
  const channelId = getLogChannelId();
  if (!channelId) return null;
  return sendDiscordMessage(channelId, { embeds: [buildOrderEmbed(order)] });
}

// Edits the same message in place to reflect a confirmed payment. Falls
// back to posting a new message if the original one isn't known (e.g. the
// initial post failed) so the confirmation still shows up somewhere.
export async function logDonateOrderPaid(order: DonateOrder): Promise<void> {
  const channelId = getLogChannelId();
  if (!channelId) return;
  const payload = { embeds: [buildOrderEmbed(order)] };
  if (order.discordMessageId) {
    await editDiscordMessage(channelId, order.discordMessageId, payload);
  } else {
    await sendDiscordMessage(channelId, payload);
  }
}

// Same edit-in-place pattern as logDonateOrderPaid, once the 10-minute
// window in expireIfStale (lib/actions/donate-order.ts) closes unpaid.
export async function logDonateOrderExpired(order: DonateOrder): Promise<void> {
  const channelId = getLogChannelId();
  if (!channelId) return;
  const payload = { embeds: [buildOrderEmbed(order)] };
  if (order.discordMessageId) {
    await editDiscordMessage(channelId, order.discordMessageId, payload);
  } else {
    await sendDiscordMessage(channelId, payload);
  }
}

// A fresh message, same reasoning as logDonatePrivilegeRevoked below — an
// admin-granted privilege never went through createDonateOrder, so there's
// no DonateOrder message to edit in place.
export async function logDonatePrivilegeGranted(params: {
  nickname: string;
  tier: DonateTier;
  expiresAt: Date;
  adminName: string;
}): Promise<void> {
  const channelId = getLogChannelId();
  if (!channelId) return;

  await sendDiscordMessage(channelId, {
    embeds: [
      {
        title: `Привілегію видано вручну — ${TIER_LABEL[params.tier]}`,
        color: 0x4caf50,
        fields: [
          { name: "Гравець", value: params.nickname, inline: true },
          { name: "Привілей", value: TIER_LABEL[params.tier], inline: true },
          { name: "Діє до", value: params.expiresAt.toLocaleString("uk-UA"), inline: true },
          { name: "Видав", value: `🛠️ ${params.adminName}`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export type DonatePrivilegeRevokeReason =
  | { type: "expired" }
  | { type: "admin"; adminName: string };

// A fresh message rather than editing anything — a revoked privilege isn't
// necessarily tied to a DonateOrder at all (an admin-granted one never had
// one), so there's no earlier message to edit in place here.
export async function logDonatePrivilegeRevoked(params: {
  nickname: string;
  tier: DonateTier;
  reason: DonatePrivilegeRevokeReason;
}): Promise<void> {
  const channelId = getLogChannelId();
  if (!channelId) return;

  const reasonText =
    params.reason.type === "expired"
      ? "⌛ Закінчився термін дії"
      : `🛠️ Видалено адміністратором — ${params.reason.adminName}`;

  await sendDiscordMessage(channelId, {
    embeds: [
      {
        title: `Привілегію знято — ${TIER_LABEL[params.tier]}`,
        color: 0xff5555,
        fields: [
          { name: "Гравець", value: params.nickname, inline: true },
          { name: "Привілей", value: TIER_LABEL[params.tier], inline: true },
          { name: "Причина", value: reasonText, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
