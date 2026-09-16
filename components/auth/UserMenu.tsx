import type { Session } from "next-auth";
import SignInButton from "./SignInButton";
import UserMenuDropdown from "./UserMenuDropdown";
import { getDiscordLink } from "@/lib/mc-db";
import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";

export default async function UserMenu({ session }: { session: Session | null }) {
  if (!session?.user) {
    return <SignInButton />;
  }

  const { discordId, role } = session.user;
  const link = discordId ? await getDiscordLink(discordId) : null;
  const profileHref = link ? `/profile/${link.nickname}` : "/profile";
  const texture = link ? await getSkinTexture(link.minecraftUuid) : null;
  const skinUrl = (texture ?? STEVE_SKIN).skinUrl;

  return (
    <UserMenuDropdown
      name="Профіль"
      skinUrl={skinUrl}
      profileHref={profileHref}
      isAdmin={role === "ADMIN"}
    />
  );
}
