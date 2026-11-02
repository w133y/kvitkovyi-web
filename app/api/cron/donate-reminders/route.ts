import { sendExpiredNotices, sendExpiryReminders } from "@/lib/donate-privilege-reminders";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Hit once a day by deploy/kvitkovyi.cron with the CRON_SECRET bearer token,
// which is enough to stop anyone else from triggering it (and running up
// Discord API calls) by just requesting the URL directly.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminders = await sendExpiryReminders();
  const expired = await sendExpiredNotices();
  return Response.json({ reminders, expired });
}
