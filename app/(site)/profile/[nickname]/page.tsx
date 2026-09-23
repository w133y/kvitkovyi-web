import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPlayerProfileByNickname, getDiscordLink, getDiscordIdForPlayer, getPlaytimeRank } from "@/lib/mc-db";
import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";
import { getBio } from "@/lib/bio";
import { getAchievementsByNickname } from "@/lib/achievements";
import { getActivePrivilege } from "@/lib/donate-privileges";
import { formatLastSeen, isOnline, lastSeenVerb } from "@/lib/format-last-seen";
import { FLORIST_SYMBOL, FLORIST_COLOR_HEX } from "@/lib/minecraft-symbols";
import { prisma } from "@/lib/prisma";
import StatBox from "@/components/profile/StatBox";
import SkinViewer from "@/components/profile/SkinViewer";
import SwordsIcon from "@/components/profile/SwordsIcon";
import ProfileEditor from "@/components/profile/ProfileEditor";
import AchievementCard from "@/components/profile/AchievementCard";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname } = await params;
  return { title: `${nickname} - Профіль - Квітковий` };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  // profile and the viewer's own session are independent lookups (neither
  // needs the other), so they run together instead of back to back.
  const [profile, session] = await Promise.all([getPlayerProfileByNickname(nickname), auth()]);

  if (!profile) {
    notFound();
  }

  // Everything below only depends on `profile` (and the now-resolved
  // `session`), not on each other, so they run as one batch of round trips
  // instead of five sequential ones.
  const [texture, bio, profileDiscordId, achievements, viewerLink, playtimeRank, privilege] = await Promise.all([
    getSkinTexture(profile.uuid).then((t) => t ?? STEVE_SKIN),
    getBio(profile.nickname),
    getDiscordIdForPlayer(profile.uuid, profile.nickname),
    getAchievementsByNickname(profile.nickname),
    session?.user?.discordId ? getDiscordLink(session.user.discordId) : Promise.resolve(null),
    getPlaytimeRank(profile.nickname),
    getActivePrivilege(profile.nickname),
  ]);
  const isOwner = viewerLink?.nickname === profile.nickname;

  const privilegeIcon = privilege
    ? privilege.tier === "FLORIST"
      ? FLORIST_SYMBOL
      : privilege.iconSymbol || FLORIST_SYMBOL
    : null;
  const privilegeColor = privilege
    ? privilege.tier === "FLORIST"
      ? FLORIST_COLOR_HEX
      : privilege.iconColorHex || FLORIST_COLOR_HEX
    : null;

  const discordUser = profileDiscordId
    ? await prisma.user.findUnique({
        where: { discordId: profileDiscordId },
        select: { name: true, showDiscord: true, twitchUrl: true, youtubeUrl: true, pronoun: true },
      })
    : null;

  return (
    <div className="profile-layout">
      <div className={privilege ? "profile-nick-badge profile-nick-badge-with-privilege" : "profile-nick-badge"}>
        <span>{profile.nickname}</span>
        {privilegeIcon && (
          <span className="profile-privilege-icon" style={{ color: privilegeColor ?? undefined }}>
            {privilegeIcon}
          </span>
        )}
      </div>

      <div className="profile-skin-card">
        <SkinViewer
          skinUrl={texture.skinUrl}
          capeUrl={texture.capeUrl}
          slim={texture.slim}
          nickname={profile.nickname}
        />
      </div>

      <ProfileEditor
        nickname={profile.nickname}
        isOwner={isOwner}
        initialBio={bio}
        discordId={profileDiscordId}
        discordName={discordUser?.name ?? null}
        initialShowDiscord={discordUser?.showDiscord ?? false}
        initialTwitchUrl={discordUser?.twitchUrl ?? null}
        initialYoutubeUrl={discordUser?.youtubeUrl ?? null}
        initialPronoun={discordUser?.pronoun ?? null}
      />

      {profile.lastSeen != null && (
        <div className="profile-online-status">
          <span className={isOnline(profile.lastSeen) ? "profile-online-text online" : "profile-online-text"}>
            {isOnline(profile.lastSeen)
              ? "Онлайн"
              : `${lastSeenVerb(discordUser?.pronoun)} ${formatLastSeen(profile.lastSeen)}`}
          </span>
          <div className="profile-top-rank-group">
            {playtimeRank != null && <span className="profile-top-rank">#{playtimeRank}</span>}
            <Link href="/leaderboard" className="profile-top-link" title="Топ гравців" aria-label="Топ гравців">
              <i className="fa-solid fa-trophy"></i>
            </Link>
          </div>
        </div>
      )}

      <div className="profile-stats-card">
        <div className="profile-stats-grid">
          <StatBox icon={<SwordsIcon />} label="Вбивств гравців" value={profile.playerKills} />
          <StatBox icon="fa-solid fa-heart-crack" label="Смертей" value={profile.deaths} />
          <StatBox icon="fa-solid fa-shoe-prints" label="Пішки" value={`${profile.walkKm} км`} />
          <StatBox
            icon="fa-solid fa-paper-plane"
            label="На елітрах"
            value={`${profile.aviateKm} км`}
          />
          <StatBox icon="fa-solid fa-water" label="Вплав" value={`${profile.swimKm} км`} />
          <StatBox
            icon="fa-solid fa-person-running"
            label="Бігом"
            value={`${profile.sprintKm} км`}
          />
        </div>
      </div>

      {achievements.length > 0 && (
        <div className="profile-achievements-card">
          <h3 className="profile-achievements-title">Картки</h3>
          <div className="achievements-grid">
            {achievements.map((a) => (
              <AchievementCard
                key={a.id}
                category={a.category}
                iconType={a.iconType}
                icon={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                borderColor={a.borderColor}
                background={a.background}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
