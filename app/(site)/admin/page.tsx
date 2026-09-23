import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
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

export const metadata: Metadata = {
  title: "Панель — Квітковий",
};

export default async function AdminPage() {
  const session = await auth();

  // Same response (404) whether the visitor is logged out or logged in as a
  // regular user — this route shouldn't confirm its own existence to anyone
  // who isn't actually an admin.
  if (session?.user?.role !== "ADMIN") {
    notFound();
  }

  const achievements = await listAchievements();
  const privileges = await listPrivileges();
  const gallerySettings = await getGallerySettings();
  const galleryPhotos = await listGalleryPhotosForAdmin();
  const wikiCategories = await listWikiCategoriesForAdmin();
  const logs = await getAdminLogs();
  const errorLoggingEnabled = await getErrorLoggingEnabled();
  const cosmeticDrafts = await listCosmeticDrafts();
  const publishedCosmetics = await listPublishedCosmetics();

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>
          <b>Адмін-панель</b>
        </h2>
        <p>Вітаємо, {session.user.name}.</p>
      </div>

      <div className="admin-section">
        <h3>Досягнення гравців</h3>
        <AchievementsAdmin initialAchievements={achievements} />
      </div>

      <div className="admin-section">
        <h3>Привілеї (Флорист / Меценат)</h3>
        <DonatePrivilegesAdmin initialPrivileges={privileges} />
      </div>

      <div className="admin-section">
        <h3>Галерея</h3>
        <GallerySettingsAdmin
          currentSeason={gallerySettings.currentSeason}
          pendingSeason={gallerySettings.pendingSeason}
          seasonLocked={gallerySettings.seasonLocked}
        />
        <h4 className="admin-gallery-photos-title">Фото</h4>
        <AdminGalleryPhotos initialPhotos={galleryPhotos} />
      </div>

      <div className="admin-section">
        <h3>Косметика</h3>
        <CosmeticsAdmin initialDrafts={cosmeticDrafts} initialPublished={publishedCosmetics} />
      </div>

      <div className="admin-section">
        <h3>Вікі</h3>
        <AdminWiki initialCategories={wikiCategories} />
      </div>

      <div className="admin-section">
        <h3>Журнал помилок</h3>
        <AdminLog initialLogs={logs} initialEnabled={errorLoggingEnabled} />
      </div>
    </div>
  );
}
