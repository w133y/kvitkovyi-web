// Votes on the suggestions forum: the bot (bot/index.mjs) posts a За / Проти
// message in every new post, clicks come to the interactions route. Only
// active players (lib/active-players.ts) may vote, one vote each — clicking
// the same button again takes it back, the other one switches it.

import { prisma } from "@/lib/prisma";
import type { DiscordActionRow } from "@/lib/discord";

export function suggestionVoteButtons(up: number, down: number): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: `За · ${up}`, custom_id: "suggest:up", emoji: { name: "👍" } },
        { type: 2, style: 4, label: `Проти · ${down}`, custom_id: "suggest:down", emoji: { name: "👎" } },
      ],
    },
  ];
}

export async function castSuggestionVote(messageId: string, discordUserId: string, up: boolean): Promise<"set" | "removed"> {
  const key = { messageId_discordUserId: { messageId, discordUserId } };
  const existing = await prisma.suggestionVote.findUnique({ where: key });
  if (existing?.up === up) {
    await prisma.suggestionVote.delete({ where: key });
    return "removed";
  }
  await prisma.suggestionVote.upsert({ where: key, update: { up }, create: { messageId, discordUserId, up } });
  return "set";
}

export async function countSuggestionVotes(messageId: string): Promise<{ up: number; down: number }> {
  const [up, down] = await Promise.all([
    prisma.suggestionVote.count({ where: { messageId, up: true } }),
    prisma.suggestionVote.count({ where: { messageId, up: false } }),
  ]);
  return { up, down };
}
