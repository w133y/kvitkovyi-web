import { getGuildMemberRoleIds } from "../lib/discord";
import { prisma } from "../lib/prisma";
for (const u of await prisma.user.findMany({ where: { discordId: { not: null } }, select: { name: true, discordId: true } }))
  if ((await getGuildMemberRoleIds(u.discordId!)).includes("1322945689780490311")) console.log("Контентмейкер:", u.name);
console.log("done");
process.exit(0);
