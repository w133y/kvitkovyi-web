import { sendWelcomeDms } from "@/lib/welcome-dm";
import { sweepUndeliveredCosmeticGrants } from "@/lib/cosmetics/sweep";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Welcome DMs for new Discord members (lib/welcome-dm.ts). Meant to be hit
// every few minutes by an external cron pinger with the CRON_SECRET bearer
// header — Vercel Hobby cron can only run once a day (the daily
// /api/cron/donate-reminders run also calls this as a fallback).
//
// Also piggybacks the cosmetics retry sweep: a furniture give only lands
// while the buyer is online, so a frequent retry is what actually delivers
// items bought while offline (within a few minutes of their next join).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cosmetics = await sweepUndeliveredCosmeticGrants()
    .then(() => "ok")
    .catch((err) => ({ error: String(err) }));
  return Response.json({ ...(await sendWelcomeDms()), cosmetics });
}
