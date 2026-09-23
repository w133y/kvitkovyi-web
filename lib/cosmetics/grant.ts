// In-game delivery for a purchased cosmetic — the other half of
// lib/actions/cosmetics-checkout.ts.
//
// - HAT/BACKPACK/BALLOON (HMCCosmetics): unlocking is a LuckPerms
//   permission node, "hmccosmetics.<id>" — the same grant shape
//   lib/donate-privilege-grants.ts uses for Флорист/Меценат. Works for
//   offline players too (LuckPerms stores it). Any color choice happens
//   afterwards in HMCCosmetics' own wardrobe menu.
// - FURNITURE (Nexo): `/nexo give <item> <amount> <player>` — item FIRST,
//   player LAST (the `/nexo` help text's "give target item amount" is
//   misleading; confirmed live: "You gave 0 players 1 × <item>!").
//   Unlike a permission, a give needs the player online, and for an offline
//   player it still "succeeds" silently with 0 players — while
//   sendServerCommand only ever sees Kinetic's HTTP 204. So delivery is
//   confirmed from Nexo's own "You gave N players" console line; N = 0
//   counts as not delivered, the grant stays PENDING, and
//   lib/cosmetics/sweep.ts retries it later.
//
// This is a one-way grant, unlike DonatePrivilege — cosmetics aren't
// time-limited, so there's no revoke/expiry counterpart here.

import { sendServerCommand, readServerFile } from "@/lib/kinetic";
import { logError } from "@/lib/admin-log";
import { NICKNAME_RE } from "@/lib/minecraft-symbols";
import type { CosmeticType } from "@prisma/client";

// A Nexo/HMCCosmetics item id — lowercase snake_case, matching every real
// id seen across the source packs. These end up embedded in a raw console
// command, and the publish flow's input ultimately traces back to an
// admin-uploaded pack's own file contents — so it's validated again here.
export const COSMETIC_ITEM_ID_RE = /^[a-z0-9_]{1,64}$/;

const GIVE_CONFIRM_TIMEOUT_MS = 5000;

// ponytail: matches the newest "You gave N players … × <item>" line after
// sending — two simultaneous gives of the same item to different players
// could read each other's line. Fine at this server's order volume; a
// per-command nonce would need Nexo support it doesn't have.
async function logLineCount(): Promise<number> {
  return (await readServerFile("/logs/latest.log")).split("\n").length;
}

async function confirmNexoGive(item: string, before: number): Promise<boolean> {
  const pattern = new RegExp(`You gave (\\d+) players? \\d+ × ${item}!`);
  const deadline = Date.now() + GIVE_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const lines = (await readServerFile("/logs/latest.log")).split("\n").slice(before - 1);
    for (const line of lines.reverse()) {
      const match = line.match(pattern);
      if (match) return Number(match[1]) > 0;
    }
  }
  return false;
}

export async function grantCosmeticInGame(params: {
  nickname: string;
  type: CosmeticType;
  nexoItemId: string;
  hmcCosmeticId: string | null;
  // FURNITURE's /nexo give amount — irrelevant for a boolean permission
  // grant (HAT/BACKPACK/BALLOON), so always 1 there.
  quantity?: number;
}): Promise<boolean> {
  if (!NICKNAME_RE.test(params.nickname)) {
    await logError("cosmetics/grant: refused, invalid nickname", params.nickname);
    return false;
  }
  if (!COSMETIC_ITEM_ID_RE.test(params.nexoItemId)) {
    await logError("cosmetics/grant: refused, invalid nexoItemId", params.nexoItemId);
    return false;
  }
  if (params.hmcCosmeticId !== null && !COSMETIC_ITEM_ID_RE.test(params.hmcCosmeticId)) {
    await logError("cosmetics/grant: refused, invalid hmcCosmeticId", params.hmcCosmeticId);
    return false;
  }

  try {
    if (params.type === "FURNITURE") {
      const amount = Math.max(1, Math.floor(params.quantity ?? 1));
      const before = await logLineCount();
      await sendServerCommand(`nexo give ${params.nexoItemId} ${amount} ${params.nickname}`);
      return await confirmNexoGive(params.nexoItemId, before);
    }
    const permissionId = params.hmcCosmeticId ?? params.nexoItemId;
    await sendServerCommand(`lp user ${params.nickname} permission set hmccosmetics.${permissionId} true`);
    return true;
  } catch (err) {
    await logError("cosmetics/grant: delivery failed", params.nickname, params.nexoItemId, err);
    return false;
  }
}
