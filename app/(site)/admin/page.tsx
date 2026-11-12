import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAchievements } from "@/lib/actions/achievements";
import { listPrivileges } from "@/lib/actions/donate-privileges";
import { getGallerySettings, listGalleryPhotosForAdmin } from "@/lib/actions/gallery";
import { getAdminLogs, getErrorLoggingEnabled } from "@/lib/actions/admin-log";
import { listWikiCategoriesForAdmin } from "@/lib/actions/wiki";
import { listCosmeticDrafts, listPublishedCosmetics } from "@/lib/actions/cosmetics-admin";
import AchievementsAdmin from "@/components/admin/AchievementsAdmin";
import DonatePrivilegesAdmin from "@/components/admin/DonatePrivilegesAdmin";
import GallerySettingsAdmin from "@/components/admin/GallerySettingsAdmin";
import AdminGalleryPhotos from "@/components/admin/AdminGalleryPhotos";
import AdminWiki from "@/components/admin/AdminWiki";
import AdminLog from "@/components/admin/AdminLog";
import CosmeticsAdmin from "@/components/admin/CosmeticsAdmin";
import SitePagesAdmin from "@/components/admin/SitePagesAdmin";
import ServerIpAdmin from "@/components/admin/ServerIpAdmin";
import MapMarkersAdmin from "@/components/admin/MapMarkersAdmin";
import PlayerBiosAdmin from "@/components/admin/PlayerBiosAdmin";
import AccountDeletionAdmin from "@/components/admin/AccountDeletionAdmin";
import { listPlayerBios } from "@/lib/actions/profile";
import { countMapMarkers } from "@/lib/actions/map-markers";
import { getServerInfo } from "@/lib/page-access";
import { listDisabledPages } from "@/lib/actions/site-pages";
import { getSeasonAdminData } from "@/lib/actions/seasons";
import SeasonAdmin from "@/components/admin/SeasonAdmin";
import AdminTabs from "@/components/admin/AdminTabs";

// Server Actions run with this page's limit — staging a large cosmetics
// pack (lib/actions/cosmetics-admin.ts) needs well over the default.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Панель — Квітковий",
};

export default async function AdminPage() {
  const session = await getSession();

  // Same response (404) whether the visitor is logged out or logged in as a
  // regular user — this route shouldn't confirm its own existence to anyone
  // who isn't actually an admin.
  if (session?.user?.role !== "ADMIN") {
    notFound();
  }

  const [
    achievements,
    privileges,
    gallerySettings,
    galleryPhotos,
    wikiCategories,
    logs,
    errorLoggingEnabled,
    cosmeticDrafts,
    publishedCosmetics,
    disabledPages,
    serverInfo,
    markerCounts,
    playerBios,
    season,
  ] = await Promise.all([
    listAchievements(),
    listPrivileges(),
    getGallerySettings(),
    listGalleryPhotosForAdmin(),
    listWikiCategoriesForAdmin(),
    getAdminLogs(),
    getErrorLoggingEnabled(),
    listCosmeticDrafts(),
    listPublishedCosmetics(),
    listDisabledPages(),
    getServerInfo(),
    countMapMarkers(),
    listPlayerBios(),
    getSeasonAdminData(),
  ]);

  const section = (title: string, content: React.ReactNode) => (
    <div className="admin-section">
      <h3>{title}</h3>
      {content}
    </div>
  );

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>
          <b>Адмін-панель</b>
        </h2>
        <p>Вітаємо, {session.user.name}.</p>
      </div>

      <AdminTabs
        tabs={[
          {
            id: "season",
            label: "Сезон і сервер",
            content: (
              <>
                {section("Сезон", <SeasonAdmin data={season} />)}
                {section("Сервер", <ServerIpAdmin initialIp={serverInfo.ip} initialVersion={serverInfo.version} />)}
                {section("Вкладки сайту", <SitePagesAdmin initialDisabled={disabledPages} />)}
              </>
            ),
          },
          {
            id: "players",
            label: "Гравці",
            content: (
              <>
                {section("Привілеї (Флорист / Меценат)", <DonatePrivilegesAdmin initialPrivileges={privileges} />)}
                {section("Досягнення гравців", <AchievementsAdmin initialAchievements={achievements} />)}
                {section("Описи гравців", <PlayerBiosAdmin initialBios={playerBios} />)}
                {section("Видалення даних", <AccountDeletionAdmin />)}
              </>
            ),
          },
          {
            id: "content",
            label: "Контент",
            content: (
              <>
                {section(
                  "Галерея",
                  <>
                    <GallerySettingsAdmin seasonLocked={gallerySettings.seasonLocked} />
                    <h4 className="admin-gallery-photos-title">Фото</h4>
                    <AdminGalleryPhotos initialPhotos={galleryPhotos} />
                  </>
                )}
                {section("Мітки на мапі", <MapMarkersAdmin initialCounts={markerCounts} />)}
                {section("Вікі", <AdminWiki initialCategories={wikiCategories} />)}
                {section("Косметика", <CosmeticsAdmin initialDrafts={cosmeticDrafts} initialPublished={publishedCosmetics} />)}
              </>
            ),
          },
          {
            id: "log",
            label: "Журнал помилок",
            content: section("Журнал помилок", <AdminLog initialLogs={logs} initialEnabled={errorLoggingEnabled} />),
          },
        ]}
      />
    </div>
  );
}
