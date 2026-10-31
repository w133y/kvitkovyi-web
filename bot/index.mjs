// The Discord bot: keeps the gateway connection to Discord.
// - DMs every new member as soon as they join (the site, talking to Discord
//   only over HTTP, has no "member joined" event).
// - Receives every interaction (buttons, modals, /gallery) and hands it to
//   the site's handler over the compose network, so they never depend on
//   which public URL the site is on. Needs the app's "Interactions Endpoint
//   URL" in the Developer Portal left empty — otherwise Discord POSTs there
//   instead of sending them down the gateway.
// Shares the site's Postgres: WelcomeDm (nobody is DMed twice, even after a
// rejoin) and SiteSettings (server IP/version, edited on /admin).

import { Client, Events, GatewayIntentBits } from "discord.js";
import pg from "pg";

const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DATABASE_URL, CRON_SECRET } = process.env;
const SITE_URL = process.env.SITE_URL ?? "https://kvitkovyi.com";
const SITE_INTERNAL_URL = process.env.SITE_INTERNAL_URL ?? "http://web:3000";
if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !DATABASE_URL || !CRON_SECRET) {
  throw new Error("DISCORD_BOT_TOKEN / DISCORD_GUILD_ID / DATABASE_URL / CRON_SECRET не налаштовано");
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

// The site's handler answers with the same JSON it would give Discord over
// HTTP; that answer goes back through the interaction callback endpoint.
async function forwardInteraction(interaction) {
  let reply;
  try {
    const res = await fetch(`${SITE_INTERNAL_URL}/api/discord/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
      body: JSON.stringify(interaction),
    });
    if (!res.ok) throw new Error(`site answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    reply = await res.json();
  } catch (err) {
    console.error("interaction failed", interaction.data?.custom_id ?? interaction.data?.name, err.message);
    reply = { type: 4, data: { content: "⚠️ Сайт не відповів — спробуйте ще раз.", flags: 64 } };
  }
  const cb = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reply),
  });
  if (!cb.ok) console.error("interaction callback", cb.status, (await cb.text()).slice(0, 200));
}

// Only the site's own interactions: the Minecraft server plugin shares this
// bot application and answers its own commands (/verify, /playerlist, …)
// over its own gateway connection — replying to those would beat it to it.
const SITE_COMMANDS = ["gallery", "Додати в галерею"];
const SITE_COMPONENT = /^(gallery|season|marker|siteadmin):/;
const isSiteInteraction = (i) =>
  i.type === 2 ? SITE_COMMANDS.includes(i.data?.name) : SITE_COMPONENT.test(i.data?.custom_id ?? "");

// Raw gateway payload: the exact shape the site's HTTP handler expects.
client.on(Events.Raw, (packet) => {
  if (packet.t === "INTERACTION_CREATE" && isSiteInteraction(packet.d)) {
    forwardInteraction(packet.d).catch((err) => console.error("interaction error", err));
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log("ready as", c.user.tag);
  const members = await (await c.guilds.fetch(DISCORD_GUILD_ID)).members.fetch();
  for (const m of members.values()) {
    if (Date.now() - (m.joinedTimestamp ?? 0) < CATCH_UP_MS) await welcome(m).catch((err) => console.error("welcome error", err));
  }
});

await client.login(DISCORD_BOT_TOKEN);
