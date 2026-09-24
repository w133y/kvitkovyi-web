// Welcome DM for people who just joined the Discord server. The site only
// receives Discord interactions over HTTP (no gateway connection), so there's
// no "member joined" event — instead this polls the member list (bot has the
// Server Members intent) and DMs anyone who joined recently and hasn't been
// welcomed yet. Run from app/api/cron/welcome/route.ts.

import { prisma } from "@/lib/prisma";
import { getOrCreateDmChannel, sendDiscordMessage } from "@/lib/discord";
import { logError } from "@/lib/admin-log";

const DISCORD_API = "https://discord.com/api/v10";

// Only recent joiners are welcomed, so turning this on (or the poller being
// down for a while) never DMs the whole existing server.
const RECENT_JOIN_MS = 48 * 60 * 60 * 1000;

const WELCOME_TEXT = `**Ласкаво просимо на сервер Квітковий🌸 **
Щоб долучитися до гри на нашому сервері, тобі потрібно🤓  :
>     1.    **Ввести наш IP: mc.kvitkovyi.pp.ua — сервер працює на версії 26.2.**
>     2.    **На екрані після входу з'явиться код.**
>     3.    **Напиши цей код мені в особисті, і я тебе додам у білий список сервера.**
*Перед грою ознайомся з правилами спільноти на сайті https://kvitkovyi.pp.ua/join або в каналі *https://discord.com/channels/1041732637628321833/1299774292032229446.
**Приємної гри на нашому квітучому сервері, друже🤩  .**`;

type GuildMember = { joined_at: string; user?: { id: string; bot?: boolean } };

async function listGuildMembers(): Promise<GuildMember[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) throw new Error("DISCORD_GUILD_ID / DISCORD_BOT_TOKEN не налаштовано");

  const members: GuildMember[] = [];
  let after = "0";
  for (;;) {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) throw new Error(`list members ${res.status}: ${await res.text().catch(() => "")}`);
    const page = (await res.json()) as GuildMember[];
    members.push(...page);
    if (page.length < 1000) return members;
    after = page[page.length - 1].user!.id;
  }
}

export async function sendWelcomeDms(): Promise<{ newMembers: number; sent: number; failed: number }> {
  const since = Date.now() - RECENT_JOIN_MS;
  const recent = (await listGuildMembers()).filter(
    (m) => m.user && !m.user.bot && new Date(m.joined_at).getTime() >= since
  );
  if (recent.length === 0) return { newMembers: 0, sent: 0, failed: 0 };

  const already = new Set(
    (
      await prisma.welcomeDm.findMany({
        where: { discordUserId: { in: recent.map((m) => m.user!.id) } },
        select: { discordUserId: true },
      })
    ).map((r) => r.discordUserId)
  );
  const toWelcome = recent.filter((m) => !already.has(m.user!.id));

  let sent = 0;
  let failed = 0;
  for (const m of toWelcome) {
    const userId = m.user!.id;
    // Claim first — the primary key stops two overlapping runs from both
    // DMing the same person.
    try {
      await prisma.welcomeDm.create({ data: { discordUserId: userId, delivered: false } });
    } catch {
      continue;
    }
    const dm = await getOrCreateDmChannel(userId);
    const ok = dm !== null && (await sendDiscordMessage(dm, { content: WELCOME_TEXT })) !== null;
    if (ok) {
      await prisma.welcomeDm.update({ where: { discordUserId: userId }, data: { delivered: true } });
      sent++;
    } else {
      // Most often closed DMs — not retried, same as the privilege reminders.
      failed++;
    }
  }
  if (failed) await logError("welcome-dm: some welcome DMs failed (closed DMs?)", failed);

  return { newMembers: toWelcome.length, sent, failed };
}
