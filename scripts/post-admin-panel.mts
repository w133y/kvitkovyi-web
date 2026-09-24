// Posts the "Адміни сайту" panel (lib/site-admins.ts) into the Discord admin
// channel. Run once: npx tsx --env-file=.env scripts/post-admin-panel.mts
// The panel then updates itself on every click; re-run only if it's deleted.

import { sendDiscordMessage } from "../lib/discord";
import { SITE_ADMINS_CHANNEL_ID, buildAdminPanel } from "../lib/site-admins";
import { prisma } from "../lib/prisma";

const id = await sendDiscordMessage(SITE_ADMINS_CHANNEL_ID, { ...(await buildAdminPanel()), allowed_mentions: { parse: [] } });
console.log(id ? `Panel posted (message ${id})` : "Failed to post the panel — see the admin log");
await prisma.$disconnect();
