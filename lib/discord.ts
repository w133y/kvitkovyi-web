// Thin client for Discord's REST API (bot token) — plain fetch calls rather
// than a full gateway connection, since posting/editing messages (with
// buttons, for the gallery moderation queue and admin confirmations) and
// managing guild member roles is all that's needed here. See also
// app/api/discord/interactions/route.ts for the other half — handling
// clicks on the buttons/slash commands this file sends out.

const DISCORD_API = "https://discord.com/api/v10";

function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token не налаштовано (перевірте .env)");
  return token;
}

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
};

// Discord message component types (v10) — just the subset used here
// (buttons in a single action row). Button style: 1 blurple, 2 gray,
// 3 green, 4 red, 5 link.
export type DiscordButton = {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label: string;
  custom_id?: string;
  url?: string;
  emoji?: { name: string };
  disabled?: boolean;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[];
};

export type DiscordMessagePayload = {
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
};

// Returns the created message's id (needed to edit it later), or null if
// sending failed — callers treat this as best-effort, never as something
// that should block the actual order/payment/submission flow.
export async function sendDiscordMessage(
  channelId: string,
  payload: DiscordMessagePayload
): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${getBotToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("discord: sendDiscordMessage failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    console.error("discord: sendDiscordMessage error", err);
    return null;
  }
}

export async function editDiscordMessage(
  channelId: string,
  messageId: string,
  payload: DiscordMessagePayload
): Promise<void> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${getBotToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("discord: editDiscordMessage failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("discord: editDiscordMessage error", err);
  }
}

function getGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("Discord guild id не налаштовано (перевірте .env)");
  return guildId;
}

export async function addGuildMemberRole(userId: string, roleId: string): Promise<void> {
  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${getGuildId()}/members/${userId}/roles/${roleId}`,
      { method: "PUT", headers: { Authorization: `Bot ${getBotToken()}` } }
    );
    if (!res.ok && res.status !== 204) {
      console.error("discord: addGuildMemberRole failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("discord: addGuildMemberRole error", err);
  }
}

export async function removeGuildMemberRole(userId: string, roleId: string): Promise<void> {
  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${getGuildId()}/members/${userId}/roles/${roleId}`,
      { method: "DELETE", headers: { Authorization: `Bot ${getBotToken()}` } }
    );
    if (!res.ok && res.status !== 204) {
      console.error("discord: removeGuildMemberRole failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("discord: removeGuildMemberRole error", err);
  }
}
