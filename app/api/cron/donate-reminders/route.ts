import { sendExpiredNotices, sendExpiryReminders } from "@/lib/donate-privilege-reminders";
import { sendWelcomeDms } from "@/lib/welcome-dm";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Hit once a day by Vercel Cron (see vercel.json) — Vercel signs its own
// cron requests with this same bearer token automatically when CRON_SECRET
// is set in the project's env vars, so this is enough to stop anyone else
// from triggering it (and running up Discord API calls) by just requesting
// the URL directly.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminders = await sendExpiryReminders();
  const expired = await sendExpiredNotices();
  // Fallback only — welcome DMs are meant to be driven by the frequent
  // /api/cron/welcome ping; this daily run just catches anything missed.
  const welcome = await sendWelcomeDms().catch((err) => ({ error: String(err) }));
  return Response.json({ reminders, expired, welcome });
}
