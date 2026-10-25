// Welcome DM bot: keeps a gateway connection to Discord and DMs every new
// member as soon as they join. Separate from the site because the site only
// talks to Discord over HTTP and has no "member joined" event.
// Shares the site's Postgres: WelcomeDm (nobody is DMed twice, even after a
// rejoin) and SiteSettings (server IP/version, edited on /admin).

import { Client, Events, GatewayIntentBits } from "discord.js";
import pg from "pg";

const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DATABASE_URL } = process.env;
const SITE_URL = process.env.SITE_URL ?? "https://kvitkovyi.com";
if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !DATABASE_URL) {
  throw new Error("DISCORD_BOT_TOKEN / DISCORD_GUILD_ID / DATABASE_URL не налаштовано");
}

// Members who joined while the bot was down are caught up on start, but only
// this recent, so a long outage never DMs half the server.
const CATCH_UP_MS = 48 * 60 * 60 * 1000;

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

const welcomeText = ({ ip, version }) => `**Ласкаво просимо на сервер Квітковий🌸 **
Щоб долучитися до гри на нашому сервері, тобі потрібно🤓  :
>     1.    **Ввести наш IP: ${ip} — сервер працює на версії ${version}.**
>     2.    **На екрані після входу з'явиться код.**
>     3.    **Напиши цей код мені в особисті, і я тебе додам у білий список сервера.**
*Перед грою ознайомся з правилами спільноти на сайті ${SITE_URL}/join або в каналі *https://discord.com/channels/1041732637628321833/1299774292032229446.
**Приємної гри на нашому квітучому сервері, друже🤩  .**`;

async function serverInfo() {
  // Same defaults as lib/site-pages.ts when /admin never saved settings.
  const { rows } = await db.query(`SELECT "serverIp" AS ip, "serverVersion" AS version FROM "SiteSettings" WHERE id = 'default'`);
  return rows[0] ?? { ip: "mc.kvitkovyi.pp.ua", version: "26.2" };
}

async function welcome(member) {
  if (member.user.bot || member.guild.id !== DISCORD_GUILD_ID) return;
  // Claim first: the primary key stops a join event and the start-up
  // catch-up from both DMing the same person.
  const claimed = await db.query(
    `INSERT INTO "WelcomeDm" ("discordUserId", delivered) VALUES ($1, false) ON CONFLICT DO NOTHING`,
    [member.id]
  );
  if (claimed.rowCount === 0) return;
  try {
    await member.send(welcomeText(await serverInfo()));
    await db.query(`UPDATE "WelcomeDm" SET delivered = true WHERE "discordUserId" = $1`, [member.id]);
    console.log("welcomed", member.user.tag);
  } catch (err) {
    // Most often closed DMs; not retried, the row stays delivered = false.
    console.error("welcome DM failed", member.user.tag, err.message);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.on(Events.GuildMemberAdd, (member) => welcome(member).catch((err) => console.error("welcome error", err)));

client.once(Events.ClientReady, async (c) => {
  console.log("ready as", c.user.tag);
  const members = await (await c.guilds.fetch(DISCORD_GUILD_ID)).members.fetch();
  for (const m of members.values()) {
    if (Date.now() - (m.joinedTimestamp ?? 0) < CATCH_UP_MS) await welcome(m).catch((err) => console.error("welcome error", err));
  }
});

await client.login(DISCORD_BOT_TOKEN);
