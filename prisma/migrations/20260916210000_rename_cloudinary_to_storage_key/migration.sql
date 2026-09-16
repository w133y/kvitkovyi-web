-- Rename, not drop+add — preserves the 3 existing rows' Cloudinary object
-- ids (still valid Cloudinary URLs, just no longer where new uploads go).
ALTER TABLE "GalleryPhoto" RENAME COLUMN "cloudinaryPublicId" TO "storageKey";
