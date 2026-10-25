import { sweepUndeliveredCosmeticGrants } from "@/lib/cosmetics/sweep";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Cosmetics retry sweep, meant to be hit every few minutes by a cron pinger
// with the CRON_SECRET bearer header: a furniture give only lands while the
// buyer is online, so a frequent retry is what actually delivers items
// bought while offline (within a few minutes of their next join). The path
// is historical — welcome DMs moved to the bot (bot/index.mjs).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cosmetics = await sweepUndeliveredCosmeticGrants()
    .then(() => "ok")
    .catch((err) => ({ error: String(err) }));
  return Response.json({ cosmetics });
}
