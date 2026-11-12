import { syncActivePlayerRole } from "@/lib/active-players";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logError } from "@/lib/admin-log";

// Hourly from deploy/kvitkovyi.cron: gives the "Активний гравець" role to
// everyone who qualifies and takes it from everyone else.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await syncActivePlayerRole());
  } catch (err) {
    await logError("active-players: sync failed", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
