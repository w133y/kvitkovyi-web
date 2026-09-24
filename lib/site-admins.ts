// Site admin management from Discord: a panel message in the admin channel
// lists who has User.role ADMIN and lets Discord server administrators add
// or remove site admins via select menus. Clicks are handled in
// app/api/discord/interactions/route.ts (custom_ids "siteadmin:add" /
// "siteadmin:remove"); scripts/post-admin-panel.mts posts the panel.

import { prisma } from "@/lib/prisma";
import type { DiscordActionRow, DiscordEmbed } from "@/lib/discord";

export const SITE_ADMINS_CHANNEL_ID = "1301107752852262923";

// Granting site admin is powerful, so only Discord members with the
// ADMINISTRATOR permission may use the panel (not the broader moderator
// mask the gallery buttons accept).
const ADMINISTRATOR = BigInt(1) << BigInt(3);

export function isDiscordAdministrator(permissions: string | undefined): boolean {
  if (!permissions) return false;
  try {
    return (BigInt(permissions) & ADMINISTRATOR) !== BigInt(0);
  } catch {
    return false;
  }
}

const DISCORD_ID_RE = /^\d{17,20}$/;

async function getPendingAdmins(): Promise<string[]> {
  return (await prisma.siteSettings.findUnique({ where: { id: "default" } }))?.pendingAdminDiscordIds ?? [];
}

async function setPendingAdmins(ids: string[]): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: { pendingAdminDiscordIds: ids },
    create: { id: "default", pendingAdminDiscordIds: ids },
  });
}

export async function buildAdminPanel(): Promise<{ embeds: DiscordEmbed[]; components: DiscordActionRow[] }> {
  const [admins, pending] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, discordId: true }, orderBy: { name: "asc" } }),
    getPendingAdmins(),
  ]);

  const lines = [
    ...admins.map((a) => `• ${a.discordId ? `<@${a.discordId}>` : ""} ${a.name ?? ""}`.trim()),
    ...pending.map((id) => `• <@${id}> — _стане адміном після першого входу на сайт_`),
  ];

  const removeOptions = [
    ...admins.map((a) => ({ label: a.name?.slice(0, 100) || a.discordId || a.id, value: `user:${a.id}` })),
    ...pending.map((id) => ({ label: `${id} (очікує входу)`, value: `pending:${id}` })),
  ].slice(0, 25);

  const components: DiscordActionRow[] = [
    { type: 1, components: [{ type: 5, custom_id: "siteadmin:add", placeholder: "➕ Додати адміна…" }] },
  ];
  if (removeOptions.length) {
    components.push({
      type: 1,
      components: [{ type: 3, custom_id: "siteadmin:remove", placeholder: "➖ Прибрати адміна…", options: removeOptions }],
    });
  }

  return {
    embeds: [
      {
        title: "Адміни сайту",
        description: `${lines.join("\n") || "—"}\n\nКерувати можуть лише учасники з правом «Адміністратор» на цьому Discord-сервері.`,
        color: 0xffd139,
      },
    ],
    components,
  };
}

export async function addSiteAdmin(discordId: string): Promise<{ ok: string } | { error: string }> {
  if (!DISCORD_ID_RE.test(discordId)) return { error: "Некоректний користувач." };

  const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true, role: true } });
  if (user) {
    if (user.role === "ADMIN") return { error: "Він уже адмін сайту." };
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    return { ok: "тепер адмін сайту" };
  }

  // Never signed in to the site yet — there's no User row to promote.
  const pending = await getPendingAdmins();
  if (pending.includes(discordId)) return { error: "Він уже чекає на перший вхід." };
  await setPendingAdmins([...pending, discordId]);
  return { ok: "стане адміном сайту після першого входу" };
}

// value is "user:<User.id>" or "pending:<discordId>" (see buildAdminPanel).
export async function removeSiteAdmin(value: string): Promise<{ ok: string; discordId: string | null } | { error: string }> {
  const [kind, id] = value.split(":");

  if (kind === "pending") {
    const pending = await getPendingAdmins();
    if (!pending.includes(id)) return { error: "Його вже немає в списку." };
    await setPendingAdmins(pending.filter((p) => p !== id));
    return { ok: "більше не стане адміном сайту", discordId: id };
  }

  if (kind !== "user") return { error: "Невідомий вибір." };
  // Never leave the site without any admin — nobody could get back in.
  if ((await prisma.user.count({ where: { role: "ADMIN" } })) <= 1) {
    return { error: "Це останній адмін сайту — спершу додайте іншого." };
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true, discordId: true } });
  if (!user || user.role !== "ADMIN") return { error: "Він уже не адмін." };
  await prisma.user.update({ where: { id }, data: { role: "USER" } });
  return { ok: "більше не адмін сайту", discordId: user.discordId };
}

// Called on a user's first Discord login (lib/auth.ts): promote them if an
// admin granted access from the panel before they had an account.
export async function promotePendingAdmin(userId: string, discordId: string): Promise<void> {
  const pending = await getPendingAdmins();
  if (!pending.includes(discordId)) return;
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  await setPendingAdmins(pending.filter((p) => p !== discordId));
}
