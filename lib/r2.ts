// Thin client for the S3-compatible upload store (RustFS on the VPS, see
// docker-compose.yml; the R2_* names are from when this was Cloudflare R2) —
// hosts gallery photos, wiki images and cosmetics assets, stored exactly as
// uploaded. Discord-submitted photos are copied here too (Discord's attachment
// URLs expire).

import crypto from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logError } from "@/lib/admin-log";

// R2_ENDPOINT is the store's PUBLIC address — what presigned browser uploads
// are signed for — and R2_INTERNAL_ENDPOINT the address the server itself
// reaches it on (inside Docker), so server-side reads/writes don't loop out
// through the internet.
function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  // The bucket's public base URL. No trailing slash.
  const publicUrl = process.env.R2_PUBLIC_URL;
  const endpoint = process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("Сховище файлів не налаштовано (перевірте .env)");
  }
  return {
    endpoint,
    internalEndpoint: process.env.R2_INTERNAL_ENDPOINT ?? endpoint,
    // RustFS only answers path-style URLs (endpoint/bucket/key), not bucket subdomains.
    forcePathStyle: !!process.env.R2_ENDPOINT,
    region: process.env.R2_REGION ?? "auto",
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
  };
}

// `internal`: the server's own reads/writes; otherwise the public endpoint,
// for URLs handed to the browser.
function getClient(internal = false): S3Client {
  const { endpoint, internalEndpoint, forcePathStyle, region, accessKeyId, secretAccessKey } = getConfig();
  return new S3Client({
    region,
    endpoint: internal ? internalEndpoint : endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    // SDK ≥3.729 otherwise bakes a CRC32 of the EMPTY body into every
    // presigned PUT URL (x-amz-checksum-crc32=AAAAAA==), so R2 rejects the
    // browser's real upload as a checksum mismatch.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

// Reconstructs a fetchable URL from a stored R2 object key — cosmetics
// (unlike GalleryPhoto) only stores the key, not a pre-built url, since
// every consumer already needs the key anyway (for cache-busting on
// re-publish and eventual deletion on edit), and the public base never
// changes per-object.
export function getPublicUrl(key: string): string {
  return `${getConfig().publicUrl}/${key}`;
}

// Same object, for the server's own fetch() — straight to the store inside
// Docker when R2_INTERNAL_ENDPOINT is set, the public URL otherwise.
export function getInternalUrl(key: string): string {
  const { internalEndpoint, bucket, publicUrl } = getConfig();
  return process.env.R2_INTERNAL_ENDPOINT ? `${internalEndpoint}/${bucket}/${key}` : `${publicUrl}/${key}`;
}

export type UploadTarget = {
  uploadUrl: string; // presigned PUT URL — the browser uploads straight here
  publicUrl: string; // final URL to store/display once the upload succeeds
  key: string; // object key, needed to delete it later
};

// The file itself is never routed through our own server — the browser PUTs
// directly to this presigned URL instead. Shared by gallery
// photo submissions and wiki article images, keyed under their own prefix
// so the two never collide.
async function createUploadTarget(prefix: string, contentType: string): Promise<UploadTarget> {
  const { bucket, publicUrl } = getConfig();
  const key = `${prefix}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const client = getClient();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${publicUrl}/${key}`, key };
}

export type GalleryUploadTarget = UploadTarget;

export async function createGalleryUploadTarget(contentType: string): Promise<GalleryUploadTarget> {
  return createUploadTarget("gallery", contentType);
}

export async function createWikiUploadTarget(contentType: string): Promise<UploadTarget> {
  return createUploadTarget("wiki", contentType);
}

// Cosmetics admin upload: a single model's texture, or a whole pack zip —
// both go straight from the browser to R2 (same 4.5MB serverless-body-cap
// reasoning as above; a multi-MB pack zip would never fit through a Server
// Action's own request body). The server action then reads the object back
// from R2's own public URL, not from a request body.
export async function createCosmeticUploadTarget(contentType: string): Promise<UploadTarget> {
  return createUploadTarget("cosmetics", contentType);
}

// For bytes that are already in memory server-side — pack models/textures
// extracted by lib/cosmetics/nexo-pack.ts, and /gallery photos downloaded
// from Discord — upload straight via the S3 client instead of round-tripping
// through a presigned URL the server would just use on itself.
export async function uploadR2Object(
  key: string,
  body: Buffer | string,
  contentType: string
): Promise<string> {
  const { bucket, publicUrl } = getConfig();
  await getClient(true).send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return `${publicUrl}/${key}`;
}

// Best-effort — called when an admin rejects/deletes a submission via the
// moderation buttons. Never blocks the moderation action itself on failure.
export async function deleteGalleryPhoto(key: string): Promise<void> {
  try {
    const { bucket } = getConfig();
    await getClient(true).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    await logError("r2: delete error", err);
  }
}
