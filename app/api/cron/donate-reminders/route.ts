import { sendExpiryReminders } from "@/lib/donate-privilege-reminders";

// Hit once a day by Vercel Cron (see vercel.json) — Vercel signs its own
// cron requests with this same bearer token automatically when CRON_SECRET
// is set in the project's env vars, so this is enough to stop anyone else
// from triggering it (and running up Discord API calls) by just requesting
// the URL directly.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await sendExpiryReminders();
  return Response.json(result);
}
