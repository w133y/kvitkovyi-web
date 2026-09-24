import { sendWelcomeDms } from "@/lib/welcome-dm";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Welcome DMs for new Discord members (lib/welcome-dm.ts). Meant to be hit
// every few minutes by an external cron pinger with the CRON_SECRET bearer
// header — Vercel Hobby cron can only run once a day (the daily
// /api/cron/donate-reminders run also calls this as a fallback).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await sendWelcomeDms());
}
