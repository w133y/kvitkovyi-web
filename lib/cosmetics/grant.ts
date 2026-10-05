// In-game delivery for a purchased cosmetic — the other half of
// lib/actions/cosmetics-checkout.ts.
//
// - HAT/BACKPACK/BALLOON (HMCCosmetics): unlocking is a LuckPerms
//   permission node, "hmccosmetics.<id>" — the same grant shape
//   lib/donate-privilege-grants.ts uses for Флорист/Меценат. Works for
//   offline players too (LuckPerms stores it). Any color choice happens
//   afterwards in HMCCosmetics' own wardrobe menu.
// - FURNITURE (Nexo): `/kvgive <player> <item> <amount>`, a console command
//   from the server's plugins/Skript/scripts/kvitkovyi-cosmetics.sk. A bare
//   `/nexo give` only reaches online players (offline it "succeeds" with
//   "You gave 0 players"), so the Skript gives right away when the player is
//   online and otherwise queues the give for their next join. Delivery is
//   confirmed from that script's own "[kvgive] ok <item> <player>" console
//   line — sendServerCommand only ever sees Kinetic's HTTP 204. No line
//   (script missing, Kinetic error) leaves the grant PENDING for
//   lib/cosmetics/sweep.ts to retry.
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

async function logLineCount(): Promise<number> {
  return (await readServerFile("/logs/latest.log")).split("\n").length;
}

async function confirmKvGive(item: string, nickname: string, before: number): Promise<boolean> {
  const pattern = new RegExp(`\\[kvgive\\] ok ${item} ${nickname}$`);
  const deadline = Date.now() + GIVE_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const lines = (await readServerFile("/logs/latest.log")).split("\n").slice(before - 1);
    for (const line of lines.reverse()) {
      if (pattern.test(line.trimEnd())) return true;
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
      await sendServerCommand(`kvgive ${params.nickname} ${params.nexoItemId} ${amount}`);
      return await confirmKvGive(params.nexoItemId, params.nickname, before);
    }
    const permissionId = params.hmcCosmeticId ?? params.nexoItemId;
    await sendServerCommand(`lp user ${params.nickname} permission set hmccosmetics.${permissionId} true`);
    return true;
  } catch (err) {
    await logError("cosmetics/grant: delivery failed", params.nickname, params.nexoItemId, err);
    return false;
  }
}
