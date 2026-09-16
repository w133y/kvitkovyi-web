import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getDiscordLink } from "@/lib/mc-db";
import { getSkinTexture, STEVE_SKIN } from "@/lib/mojang-skin";
import DonateBuilder from "@/components/shop/DonateBuilder";
import SignInButton from "@/components/auth/SignInButton";

export const metadata: Metadata = {
  title: "Спонсорство - Квітковий",
};

export default async function SponsorshipPage() {
  const session = await auth();
  const link = session?.user?.discordId ? await getDiscordLink(session.user.discordId) : null;

  return (
    <div className="donate-page">
      <div className="donate-header">
        <h2>
          <b>Спонсорство</b>
        </h2>
        <p>Привілеї, що підтримують розвиток серверу Квітковий.</p>
      </div>

      {link ? (
        <DonateBuilderData nickname={link.nickname} uuid={link.minecraftUuid} />
      ) : (
        <div className="donate-signin-prompt">
          <p>
            {session
              ? "До вашого Discord-акаунту не прив'язано нікнейм на сервері."
              : "Увійдіть через Discord, щоб оформити привілегію."}
          </p>
          {!session && <SignInButton />}
        </div>
      )}
    </div>
  );
}

async function DonateBuilderData({ nickname, uuid }: { nickname: string; uuid: string }) {
  const texture = (await getSkinTexture(uuid)) ?? STEVE_SKIN;
  return (
    <DonateBuilder
      nickname={nickname}
      skinUrl={texture.skinUrl}
      capeUrl={texture.capeUrl}
      slim={texture.slim}
    />
  );
}
