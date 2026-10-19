// Thin client for Discord's REST API (bot token) — plain fetch calls rather
// than a full gateway connection, since posting/editing messages (with
// buttons, for the gallery moderation queue and admin confirmations) and
// managing guild member roles is all that's needed here. See also
// app/api/discord/interactions/route.ts for the other half — handling
// clicks on the buttons/slash commands this file sends out.

import { logError } from "@/lib/admin-log";

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
  thumbnail?: { url: string };
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

// String select menu (component type 3) — must sit alone in its action row.
export type DiscordSelectMenu = {
  type: 3;
  custom_id: string;
  placeholder?: string;
  options: { label: string; value: string; emoji?: { name: string }; default?: boolean }[];
};

// User select menu (component type 5) — picks a member of the server.
export type DiscordUserSelect = {
  type: 5;
  custom_id: string;
  placeholder?: string;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[] | [DiscordSelectMenu] | [DiscordUserSelect];
};

export type DiscordMessagePayload = {
  content?: string;
  // e.g. { parse: [] } — show <@id> mentions without pinging anyone.
  allowed_mentions?: { parse: string[] };
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
      await logError("discord: sendDiscordMessage failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    await logError("discord: sendDiscordMessage error", err);
    return null;
  }
}

// Replaces the "thinking…" placeholder of a deferred interaction response.
// Authenticated by the interaction token itself (valid 15 min), not the bot
// token — used when a slash command needs longer than Discord's 3s reply
// window (e.g. /gallery downloading and re-uploading the photo).
export async function editInteractionResponse(applicationId: string, interactionToken: string, content: string): Promise<void> {
  try {
    const res = await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) await logError("discord: editInteractionResponse failed", res.status, await res.text().catch(() => ""));
  } catch (err) {
    await logError("discord: editInteractionResponse error", err);
  }
}

// A DM "channel" has to be opened (or looked up, if one already exists —
// Discord's API is idempotent here) before a message can be sent to it;
// there's no such thing as messaging a user id directly. Used by the
// donate-privilege expiry reminder (lib/donate-privilege-reminders.ts).
export async function getOrCreateDmChannel(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${getBotToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!res.ok) {
      await logError("discord: getOrCreateDmChannel failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    await logError("discord: getOrCreateDmChannel error", err);
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
      await logError("discord: editDiscordMessage failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    await logError("discord: editDiscordMessage error", err);
  }
}

// "Газета" — the server's own newsletter/announcement-graphic channel.
// /archive mirrors whatever's posted there, read-only.
export const NEWSPAPER_CHANNEL_ID = "1363201401177772063";

export type ChannelImagePage = { url: string; width: number; height: number };

export type ChannelImagePost = {
  id: string;
  // Most issues post one scan per message, but some post the newspaper as
  // several page images in the same message — all of them, in attachment
  // order, not just the first. Width/height come straight from Discord's own
  // attachment metadata, so the lightbox can reserve the right aspect ratio
  // before the image itself has loaded, instead of the layout jumping once
  // it does.
  pages: ChannelImagePage[];
  content: string;
  timestamp: string;
};

// The REST API returns message content with raw <@&roleId>/<@userId> mention
// syntax — the official client resolves those client-side from its own
// cached member/role list, which we don't have. Every issue in this channel
// pings the same announcement role, which is just noise in a caption, so
// mentions are dropped rather than resolved to a name.
function stripMentions(content: string): string {
  return content
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type RawDiscordMessage = {
  id: string;
  content: string;
  timestamp: string;
  attachments: {
    url: string;
    content_type?: string;
    filename: string;
    width?: number;
    height?: number;
  }[];
};

function toPost(msg: RawDiscordMessage): ChannelImagePost | null {
  const images = msg.attachments.filter(
    (a) => a.content_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.filename)
  );
  if (images.length === 0) return null;
  return {
    id: msg.id,
    // Discord always sends width/height for an image attachment — the
    // fallback here is only for the type checker, not a real case.
    pages: images.map((a) => ({ url: a.url, width: a.width ?? 1024, height: a.height ?? 1448 })),
    content: stripMentions(msg.content),
    timestamp: msg.timestamp,
  };
}

export type ChannelImagePostPage = {
  posts: ChannelImagePost[];
  // The oldest raw message id actually seen this call — pass back as
  // `before` to keep paginating older history ("Завантажити ще"). null
  // means the channel's start was reached, so there's nothing further back.
  nextBefore: string | null;
};

// Reads straight from Discord on every call (a short revalidate window on
// the caller's fetch is what keeps this cheap) rather than mirroring
// attachments into our own storage — Discord's CDN links for a message
// fetched this way are always freshly issued, so there's no expired-URL
// bookkeeping to do.
//
// `count` is how many qualifying (image-attached) POSTS to return, not raw
// messages — text-only chatter mixed into the channel means one page of
// image posts can span more than one page of raw messages, so this loops
// Discord's own `before`-cursor pagination (100 raw messages per call, its
// max) until either enough posts are collected or the channel runs out.
export async function getChannelImagePosts(
  channelId: string,
  count: number,
  before?: string
): Promise<ChannelImagePostPage> {
  const posts: ChannelImagePost[] = [];
  let cursor: string | null = before ?? null;
  // Only set once Discord itself confirms there's nothing older left to
  // fetch (an empty batch) — a batch merely shorter than the 100 max isn't
  // proof by itself (it can still be immediately followed by more), so
  // relying on that instead used to under-count and silently drop the
  // oldest handful of issues.
  let reachedEnd = false;

  try {
    while (posts.length < count) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("before", cursor);

      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, {
        headers: { Authorization: `Bot ${getBotToken()}` },
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        await logError("discord: getChannelImagePosts failed", res.status, await res.text().catch(() => ""));
        break;
      }
      const messages = (await res.json()) as RawDiscordMessage[];
      if (messages.length === 0) {
        reachedEnd = true;
        break;
      }

      for (const msg of messages) {
        cursor = msg.id;
        const post = toPost(msg);
        if (post) posts.push(post);
        if (posts.length >= count) break;
      }
    }
  } catch (err) {
    await logError("discord: getChannelImagePosts error", err);
  }

  return { posts, nextBefore: reachedEnd ? null : cursor };
}

export type ChannelPostStats = { total: number; latestTimestamp: string | null };

// A lightweight full-history walk for the archive page's header line ("N
// випусків, останнє оновлення ...") — keeps only a running count + the
// newest timestamp instead of retaining every post's page/attachment data
// the way getChannelImagePosts does, since the caller only wants the total
// here, not the posts themselves (those are fetched separately, N at a
// time). Same cursor pagination, so the per-page 5-minute cache above still
// applies.
export async function getChannelPostStats(channelId: string): Promise<ChannelPostStats> {
  let total = 0;
  let latestTimestamp: string | null = null;
  let cursor: string | null = null;

  try {
    for (;;) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("before", cursor);

      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, {
        headers: { Authorization: `Bot ${getBotToken()}` },
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        await logError("discord: getChannelPostStats failed", res.status, await res.text().catch(() => ""));
        break;
      }
      const messages = (await res.json()) as RawDiscordMessage[];
      if (messages.length === 0) break;

      for (const msg of messages) {
        cursor = msg.id;
        if (toPost(msg)) {
          total++;
          if (!latestTimestamp) latestTimestamp = msg.timestamp;
        }
      }
    }
  } catch (err) {
    await logError("discord: getChannelPostStats error", err);
  }

  return { total, latestTimestamp };
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
      await logError("discord: addGuildMemberRole failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    await logError("discord: addGuildMemberRole error", err);
  }
}

export async function removeGuildMemberRole(userId: string, roleId: string): Promise<void> {
  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${getGuildId()}/members/${userId}/roles/${roleId}`,
      { method: "DELETE", headers: { Authorization: `Bot ${getBotToken()}` } }
    );
    if (!res.ok && res.status !== 204) {
      await logError("discord: removeGuildMemberRole failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    await logError("discord: removeGuildMemberRole error", err);
  }
}

// The member's role ids on the server's guild — [] when they aren't in it
// (404) or the lookup fails, so a profile just shows no role badges.
export async function getGuildMemberRoleIds(userId: string): Promise<string[]> {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${getGuildId()}/members/${userId}`, {
      headers: { Authorization: `Bot ${getBotToken()}` },
      // Roles change rarely; one lookup per player per 5 minutes is plenty.
      next: { revalidate: 300 },
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      await logError("discord: getGuildMemberRoleIds failed", res.status, await res.text().catch(() => ""));
      return [];
    }
    return ((await res.json()) as { roles?: string[] }).roles ?? [];
  } catch (err) {
    await logError("discord: getGuildMemberRoleIds error", err);
    return [];
  }
}
