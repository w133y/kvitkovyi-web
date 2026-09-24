// Registers the /gallery slash command (handled by
// app/api/discord/interactions/route.ts). Run: npx tsx --env-file=.env scripts/register-gallery-command.mts
//
// Registered as a GUILD command on purpose: the Minecraft plugin sharing this
// bot application bulk-overwrites the GLOBAL command list on startup, which
// silently deleted a global /gallery. Guild commands are a separate list it
// doesn't touch. Re-running this is safe — POST upserts by name.

const API = "https://discord.com/api/v10";
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !guildId) throw new Error("DISCORD_BOT_TOKEN / DISCORD_GUILD_ID не налаштовано");

const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
const app = (await (await fetch(`${API}/applications/@me`, { headers })).json()) as { id: string };

const command = {
  name: "gallery",
  description: "Надіслати фото в галерею сайту",
  type: 1,
  options: [
    { type: 11, name: "photo", description: "Фото (скріншот із сервера)", required: true },
    { type: 3, name: "description", description: "Опис фото", required: false, max_length: 300 },
    { type: 4, name: "season", description: "Сезон (за замовчуванням — поточний)", required: false, min_value: 1 },
  ],
};

const res = await fetch(`${API}/applications/${app.id}/guilds/${guildId}/commands`, {
  method: "POST",
  headers,
  body: JSON.stringify(command),
});
const body = (await res.json()) as { id?: string; name?: string; message?: string };
if (!res.ok) throw new Error(`Discord ${res.status}: ${JSON.stringify(body)}`);
console.log(`/gallery registered in guild ${guildId} (command ${body.id})`);
