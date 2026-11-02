// Shared guard for app/api/cron/* routes: callers (deploy/kvitkovyi.cron) send
// "Authorization: Bearer <CRON_SECRET>". Without it anyone could trigger these
// and run up Discord API calls.
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
