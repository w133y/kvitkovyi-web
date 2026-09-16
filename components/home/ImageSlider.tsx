import { getTodayGallery, getGallerySettings } from "@/lib/actions/gallery";
import GallerySlider from "@/components/home/GallerySlider";

export default async function ImageSlider() {
  const [photos, settings] = await Promise.all([getTodayGallery(), getGallerySettings()]);
  if (photos.length === 0) return null;

  return (
    <GallerySlider
      photos={photos.map((p) => ({
        id: p.id,
        url: p.url,
        description: p.showDescription ? p.description : null,
        author: p.author,
      }))}
      defaultSeason={settings.currentSeason}
      seasonLocked={settings.seasonLocked}
    />
  );
}
