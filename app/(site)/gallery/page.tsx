import type { Metadata } from "next";
import Link from "next/link";
import { getAllGalleryPhotos, type GallerySort } from "@/lib/actions/gallery";

export const metadata: Metadata = {
  title: "Галерея - Квітковий",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort: GallerySort = sortParam === "season" ? "season" : "date";
  const photos = await getAllGalleryPhotos(sort);

  return (
    <div className="gallery-page">
      <div className="gallery-page-header">
        <h2>
          <b>Галерея</b>
        </h2>
        <p>Усі фото спільноти — {photos.length} шт.</p>
      </div>

      <div className="gallery-page-sort">
        <span>Сортування:</span>
        <Link href="/gallery?sort=date" className={`gallery-sort-btn ${sort === "date" ? "active" : ""}`}>
          За датою
        </Link>
        <Link href="/gallery?sort=season" className={`gallery-sort-btn ${sort === "season" ? "active" : ""}`}>
          За сезоном
        </Link>
      </div>

      {photos.length === 0 ? (
        <p className="gallery-page-empty">Поки що немає фото.</p>
      ) : (
        <div className="gallery-page-grid">
          {photos.map((photo) => (
            <div className="gallery-page-card" key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Фото галереї" loading="lazy" />
              <div className="gallery-page-card-info">
                <span className="gallery-page-card-season">Сезон {photo.season}</span>
                {photo.showDescription && photo.description && (
                  <span className="gallery-page-card-desc">{photo.description}</span>
                )}
                {photo.author && <span className="gallery-page-card-author">Фото: {photo.author}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
