import type { Metadata } from "next";
import Link from "next/link";
import { getAllGalleryPhotos, getGalleryPhotoSeasons, type GallerySort, type GalleryFilter } from "@/lib/actions/gallery";
import GalleryGrid from "@/components/gallery/GalleryGrid";

export const metadata: Metadata = {
  title: "Галерея - Квітковий",
};

function parseFilter(raw: string | undefined): GalleryFilter {
  if (raw === "legacy") return "legacy";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function filterHref(sort: GallerySort, filter: GalleryFilter): string {
  const params = new URLSearchParams();
  if (sort !== "date") params.set("sort", sort);
  if (filter !== undefined) params.set("season", String(filter));
  const qs = params.toString();
  return qs ? `/gallery?${qs}` : "/gallery";
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; season?: string }>;
}) {
  const { sort: sortParam, season: seasonParam } = await searchParams;
  const sort: GallerySort = sortParam === "season" ? "season" : "date";
  const filter = parseFilter(seasonParam);
  const [photos, seasons] = await Promise.all([getAllGalleryPhotos(sort, filter), getGalleryPhotoSeasons()]);

  return (
    <div className="gallery-page">
      <Link href="/#gallery" className="back-link back-link-floating">
        <i className="fa-solid fa-arrow-left"></i>
        Назад
      </Link>

      <div className="gallery-page-header">
        <h2>
          <b>Галерея</b>
        </h2>
        <p>Усі фото спільноти — {photos.length} шт.</p>
      </div>

      <div className="gallery-page-filters">
        <div className="gallery-page-sort">
          <span>Сортування:</span>
          <Link
            href={filterHref("date", filter)}
            className={`gallery-sort-btn ${sort === "date" ? "active" : ""}`}
          >
            За датою
          </Link>
          <Link
            href={filterHref("season", filter)}
            className={`gallery-sort-btn ${sort === "season" ? "active" : ""}`}
          >
            За сезоном
          </Link>
        </div>

        <div className="gallery-page-sort">
          <span>Сезон:</span>
          <Link href={filterHref(sort, undefined)} className={`gallery-sort-btn ${filter === undefined ? "active" : ""}`}>
            Всі
          </Link>
          {seasons.map((s) => (
            <Link key={s} href={filterHref(sort, s)} className={`gallery-sort-btn ${filter === s ? "active" : ""}`}>
              {s}
            </Link>
          ))}
          <Link href={filterHref(sort, "legacy")} className={`gallery-sort-btn ${filter === "legacy" ? "active" : ""}`}>
            Старі фото
          </Link>
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="gallery-page-empty">Поки що немає фото.</p>
      ) : (
        <GalleryGrid photos={photos} />
      )}
    </div>
  );
}
