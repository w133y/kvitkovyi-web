"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  grantDonatePrivilegeInGame,
  revokeDonatePrivilegeInGame,
  sweepExpiredDonatePrivileges,
} from "@/lib/donate-privilege-grants";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
  return session;
}

// Admin audit view — every row, active or expired, newest expiry first.
// There's no cron, so this is also where expired privileges actually get
// revoked in-game (LuckPerms group + suffix) — see
// lib/donate-privilege-grants.ts for why that's an acceptable tradeoff here.
export async function listPrivileges() {
  await requireAdmin();
  await sweepExpiredDonatePrivileges();
  return prisma.donatePrivilege.findMany({
    orderBy: [{ expiresAt: "desc" }],
  });
}

export type GrantPrivilegeInput = {
  nickname: string;
  tier: "FLORIST" | "MECENAT";
  iconSymbol: string;
  iconColorHex: string;
  durationDays: number;
};

// No payment flow wired up yet (Donatello polling worker is a later
// phase) — this is how an admin manually records "this player paid,
// give them the tier for N days" in the meantime.
//
// Returns the created row's real id so the admin panel's optimistic UI
// update can use it instead of a client-made placeholder — a placeholder
// id would make an immediate revokePrivilege() call on that same row fail
// (no such record) until the page was reloaded and picked up the real one.
export async function grantPrivilege(input: GrantPrivilegeInput): Promise<{ id: string }> {
  await requireAdmin();
  const nickname = input.nickname.trim();
  if (!nickname) throw new Error("Вкажіть нікнейм гравця");
  if (!Number.isFinite(input.durationDays) || input.durationDays <= 0) {
    throw new Error("Тривалість має бути більшою за 0");
  }

  const expiresAt = new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000);

  const iconSymbol = input.tier === "MECENAT" ? input.iconSymbol.trim() || null : null;
  const iconColorHex = input.tier === "MECENAT" ? input.iconColorHex.trim() || null : null;

  const created = await prisma.donatePrivilege.create({
    data: { nickname, tier: input.tier, iconSymbol, iconColorHex, expiresAt },
  });

  // The DB row alone only drives the site's own badge — grant the actual
  // LuckPerms group + suffix too, same as a confirmed Donatello payment does.
  await grantDonatePrivilegeInGame({ nickname, tier: input.tier, iconSymbol, iconColorHex });

  revalidatePath("/admin");
  revalidatePath(`/profile/${nickname}`);
  return { id: created.id };
}

export async function revokePrivilege(id: string) {
  const session = await requireAdmin();
  const existing = await prisma.donatePrivilege.findUnique({ where: { id } });
  // Nothing to do — a stale client-side id (see grantPrivilege above), or
  // the row was already removed by another admin/tab/the expiry sweep.
  // Calling .delete() unconditionally here throws "record not found".
  if (!existing) return;

  await prisma.donatePrivilege.delete({ where: { id } });
  await revokeDonatePrivilegeInGame({
    nickname: existing.nickname,
    tier: existing.tier,
    reason: { type: "admin", adminName: session?.user?.name ?? "адмін" },
  });
  revalidatePath("/admin");
  revalidatePath(`/profile/${existing.nickname}`);
}
