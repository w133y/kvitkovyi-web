// Shared guard for app/api/cron/* routes: callers (deploy/kvitkovyi.cron) send
// "Authorization: Bearer <CRON_SECRET>". Without it anyone could trigger these
// and run up Discord API calls.
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured must not mean open to everyone.
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}
