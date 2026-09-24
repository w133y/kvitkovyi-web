// Shared guard for app/api/cron/* routes. Vercel Cron sends
// "Authorization: Bearer <CRON_SECRET>" automatically when CRON_SECRET is set;
// an external pinger (for the frequent welcome check) sends the same header.
// Without it anyone could trigger these and run up Discord API calls.
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
