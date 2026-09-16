import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDiscordLink } from "@/lib/mc-db";

// /profile only makes sense for someone whose Discord is linked to a
// Minecraft account — anyone else (logged out, or logged in but not yet
// linked) gets sent to the leaderboard instead of a dead-end placeholder.
export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.discordId) {
    redirect("/leaderboard");
  }

  const link = await getDiscordLink(session.user.discordId);

  if (!link) {
    redirect("/leaderboard");
  }

  redirect(`/profile/${link.nickname}`);
}
