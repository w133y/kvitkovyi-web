// Thin client for Cloudflare R2 (S3-compatible object storage) — hosts
// user-submitted gallery photos (see lib/actions/gallery.ts). Replaced
// Cloudinary: R2 stores files exactly as uploaded (no forced compression),
// a 10GB free tier with zero egress fees, and no "delete inactive content"
// policy like Imgur's. Discord-submitted photos (via the /gallery slash
// command) skip this entirely and keep their Discord CDN attachment URL.

import crypto from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logError } from "@/lib/admin-log";

function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  // The bucket's public base URL — either its r2.dev "Public Development
  // URL" or a custom domain connected to it. No trailing slash.
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("Cloudflare R2 не налаштовано (перевірте .env)");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

function getClient(): S3Client {
  const { accountId, accessKeyId, secretAccessKey } = getConfig();
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export type GalleryUploadTarget = {
  uploadUrl: string; // presigned PUT URL — the browser uploads straight here
  publicUrl: string; // final URL to store/display once the upload succeeds
  key: string; // object key, needed to delete it later
};

// Same reasoning as the Cloudinary version this replaced: Vercel's
// serverless functions hard-cap request bodies at 4.5MB at the platform
// level, so the file itself is never routed through our own server — the
// browser PUTs directly to this presigned URL instead.
export async function createGalleryUploadTarget(contentType: string): Promise<GalleryUploadTarget> {
  const { bucket, publicUrl } = getConfig();
  const key = `gallery/${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const client = getClient();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${publicUrl}/${key}`, key };
}

// Best-effort — called when an admin rejects/deletes a submission via the
// moderation buttons. Never blocks the moderation action itself on failure.
export async function deleteGalleryPhoto(key: string): Promise<void> {
  try {
    const { bucket } = getConfig();
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    await logError("r2: delete error", err);
  }
}
