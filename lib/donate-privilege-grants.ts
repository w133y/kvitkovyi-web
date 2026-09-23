// The in-game (and in-Discord) half of a Флорист/Меценат privilege —
// granting/revoking the LuckPerms group, the nickname suffix badge on the
// live server, and the matching Discord role. Shared between the automatic
// Donatello flow (lib/actions/donate-order.ts), the admin's manual
// grant/revoke (lib/actions/donate-privileges.ts), and the expiry sweep
// below — DonatePrivilege rows in Postgres only ever drive the site's own
// badge display, never LuckPerms/Discord directly, so every path that
// creates or removes one must also call through here.

import { prisma } from "@/lib/prisma";
import { sendServerCommand } from "@/lib/kinetic";
import { addGuildMemberRole, removeGuildMemberRole } from "@/lib/discord";
import { getDiscordIdForNickname } from "@/lib/mc-db";
import { logDonatePrivilegeRevoked, type DonatePrivilegeRevokeReason } from "@/lib/donate-order-log";
import { logError } from "@/lib/admin-log";
import { FLORIST_SYMBOL, FLORIST_COLOR_HEX, HEX_COLOR_RE, NICKNAME_RE } from "@/lib/minecraft-symbols";
import type { DonateTier } from "@prisma/client";

export const TIER_LP_GROUP: Record<DonateTier, string> = {
  FLORIST: "florist",
  MECENAT: "mecenat",
};

function getTierRoleId(tier: DonateTier): string | null {
  const roleId = tier === "FLORIST" ? process.env.DISCORD_ROLE_FLORIST : process.env.DISCORD_ROLE_MECENAT;
  if (!roleId) {
    console.error(`donate-privilege-grants: DISCORD_ROLE_${tier} не налаштовано (перевірте .env)`);
    return null;
  }
  return roleId;
}

const SUFFIX_PRIORITY = 100;

// Full RGB via MiniMessage's <#hex> tag now (the donate builder's picker is
// a free hue slider + hex input, not the old 16-swatch grid) rather than
// snapping to the nearest of the 16 classic &-codes. HEX_COLOR_RE isn't
// just picky here — an unvalidated value would land straight inside a raw
// console command string below, so a value that fails it is treated as
// untrusted and replaced with the same safe fallback Флорист always uses,
// not passed through.
function safeHexColor(hex: string): string {
  return HEX_COLOR_RE.test(hex) ? hex : FLORIST_COLOR_HEX;
}

// The picker characters carry a trailing U+FE0E (forces plain-glyph
// rendering on the web) that has no meaning in Minecraft's own font — strip
// it before it ends up in a chat suffix.
function stripVariationSelector(symbol: string): string {
  return symbol.replace(/︎/g, "");
}

export async function grantDonatePrivilegeInGame(params: {
  nickname: string;
  tier: DonateTier;
  iconSymbol: string | null;
  iconColorHex: string | null;
}) {
  if (!NICKNAME_RE.test(params.nickname)) {
    await logError("donate-privilege-grants: refused grant, invalid nickname", params.nickname);
    return;
  }

  try {
    await sendServerCommand(`lp user ${params.nickname} parent add ${TIER_LP_GROUP[params.tier]}`);
  } catch (err) {
    await logError("donate-privilege-grants: group grant failed", err);
  }

  const symbol = params.tier === "MECENAT" ? params.iconSymbol : FLORIST_SYMBOL;
  const colorHex = params.tier === "MECENAT" ? params.iconColorHex : FLORIST_COLOR_HEX;
  if (symbol && colorHex) {
    // Leading space (not trailing) — a suffix sits right after the
    // nickname, same side as the icon on the site's own badge.
    const suffix = ` <${safeHexColor(colorHex)}>${stripVariationSelector(symbol)}`;
    try {
      await sendServerCommand(`lp user ${params.nickname} meta setsuffix ${SUFFIX_PRIORITY} "${suffix}"`);
    } catch (err) {
      await logError("donate-privilege-grants: suffix grant failed", err);
    }
    // Belt-and-suspenders: an earlier build of this feature used a prefix
    // instead — clear any leftover one at this priority so a badge granted
    // back then doesn't linger forever alongside the new suffix.
    try {
      await sendServerCommand(`lp user ${params.nickname} meta removeprefix ${SUFFIX_PRIORITY}`);
    } catch (err) {
      await logError("donate-privilege-grants: stale prefix cleanup failed", err);
    }
  }

  const roleId = getTierRoleId(params.tier);
  if (roleId) {
    const discordId = await getDiscordIdForNickname(params.nickname);
    if (discordId) {
      await addGuildMemberRole(discordId, roleId);
    } else {
      await logError("donate-privilege-grants: no linked Discord account, skipped role grant for", params.nickname);
    }
  }
}

// Removes the tier's group. Only clears the suffix if the player has no
// other currently-active, unrevoked privilege left — LuckPerms only stores
// one suffix value at this priority, so blindly unsetting it here would
// also wipe a still-active Флорист/Меценат badge on an upgrade/downgrade.
// If one remains, its own badge is simply re-applied instead.
export async function revokeDonatePrivilegeInGame(params: {
  nickname: string;
  tier: DonateTier;
  reason: DonatePrivilegeRevokeReason;
}) {
  if (!NICKNAME_RE.test(params.nickname)) {
    await logError("donate-privilege-grants: refused revoke, invalid nickname", params.nickname);
    return;
  }

  try {
    await sendServerCommand(`lp user ${params.nickname} parent remove ${TIER_LP_GROUP[params.tier]}`);
  } catch (err) {
    await logError("donate-privilege-grants: group revoke failed", err);
  }

  const revokedRoleId = getTierRoleId(params.tier);
  if (revokedRoleId) {
    const discordId = await getDiscordIdForNickname(params.nickname);
    if (discordId) {
      await removeGuildMemberRole(discordId, revokedRoleId);
    } else {
      await logError("donate-privilege-grants: no linked Discord account, skipped role revoke for", params.nickname);
    }
  }

  await logDonatePrivilegeRevoked({ nickname: params.nickname, tier: params.tier, reason: params.reason });

  const stillActive = await prisma.donatePrivilege.findFirst({
    where: { nickname: params.nickname, expiresAt: { gt: new Date() }, revokedAt: null },
  });

  if (stillActive) {
    await grantDonatePrivilegeInGame({
      nickname: params.nickname,
      tier: stillActive.tier,
      iconSymbol: stillActive.iconSymbol,
      iconColorHex: stillActive.iconColorHex,
    });
    return;
  }

  try {
    await sendServerCommand(`lp user ${params.nickname} meta removesuffix ${SUFFIX_PRIORITY}`);
  } catch (err) {
    await logError("donate-privilege-grants: suffix removal failed", err);
  }
  // Same leftover-prefix cleanup as the grant path above.
  try {
    await sendServerCommand(`lp user ${params.nickname} meta removeprefix ${SUFFIX_PRIORITY}`);
  } catch (err) {
    await logError("donate-privilege-grants: stale prefix cleanup failed", err);
  }
}

// Sweeps every privilege that's past its expiresAt but hasn't been revoked
// in-game yet. There's no cron here — this runs opportunistically wherever
// it's cheap to check (the admin list, a profile page load for that one
// nickname), which is a fine tradeoff for a server this size but means an
// expired privilege only actually gets revoked the next time someone
// happens to trigger a sweep, not the instant it expires.
export async function sweepExpiredDonatePrivileges(nickname?: string) {
  const expired = await prisma.donatePrivilege.findMany({
    where: {
      expiresAt: { lte: new Date() },
      revokedAt: null,
      ...(nickname ? { nickname } : {}),
    },
  });

  for (const priv of expired) {
    await revokeDonatePrivilegeInGame({ nickname: priv.nickname, tier: priv.tier, reason: { type: "expired" } });
    await prisma.donatePrivilege.update({
      where: { id: priv.id },
      data: { revokedAt: new Date() },
    });
  }
}
