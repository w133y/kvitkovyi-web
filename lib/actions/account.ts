"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDiscordIdForNickname } from "@/lib/mc-db";
import { deleteAccountData } from "@/lib/account-deletion";

// A player deleting their own account from the profile editor.
export async function deleteMyAccount(confirmation: string): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Потрібно увійти" };
  if (confirmation.trim().toUpperCase() !== "ВИДАЛИТИ") return { error: "Введіть слово ВИДАЛИТИ для підтвердження" };
  return deleteAccountData(session.user.id);
}

// /admin → "Видалення даних": for requests that come in by Discord/e-mail.
// Accepts a Discord id or a Minecraft nickname.
export async function deleteAccountAsAdmin(identifier: string): Promise<{ ok: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Доступ заборонено");

  const id = identifier.trim();
  if (!id) return { error: "Вкажіть Discord ID або нік" };
  const discordId = /^\d{17,20}$/.test(id) ? id : await getDiscordIdForNickname(id);
  if (!discordId) return { error: "Не знайдено прив'язаного Discord для цього ніку" };

  const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true } });
  if (!user) return { error: "Цей гравець не має акаунта на сайті" };

  const result = await deleteAccountData(user.id);
  return "error" in result ? result : { ok: `Дані акаунта (${id}) видалено` };
}
