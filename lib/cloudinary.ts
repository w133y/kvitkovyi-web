// Thin client for Cloudinary's signed upload API — hosts user-submitted
// gallery photos (see lib/actions/gallery.ts). Discord-submitted photos
// (via the /gallery slash command) skip this entirely and just keep their
// Discord CDN attachment URL, since Discord already hosts those.

import crypto from "crypto";
import { logError } from "@/lib/admin-log";

function getConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary не налаштовано (перевірте .env)");
  }
  return { cloudName, apiKey, apiSecret };
}

// Cloudinary's signing scheme: every param that will be sent (except
// file/api_key/signature themselves) gets sorted, joined as key=value&...,
// then SHA1'd together with the api secret appended.
function sign(params: Record<string, string | number>, apiSecret: string): string {
  const joined = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(joined + apiSecret).digest("hex");
}

export type UploadedPhoto = { url: string; publicId: string };

export async function uploadGalleryPhoto(file: Blob): Promise<UploadedPhoto> {
  const { cloudName, apiKey, apiSecret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ folder: "gallery", timestamp }, apiSecret);

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", "gallery");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    await logError("cloudinary: upload failed", res.status, await res.text().catch(() => ""));
    throw new Error("Не вдалося завантажити фото");
  }
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, publicId: data.public_id };
}

// Best-effort — called when an admin rejects/deletes a submission via the
// moderation buttons. Never blocks the moderation action itself on failure.
export async function deleteGalleryPhoto(publicId: string): Promise<void> {
  try {
    const { cloudName, apiKey, apiSecret } = getConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign({ public_id: publicId, timestamp }, apiSecret);

    const form = new FormData();
    form.append("public_id", publicId);
    form.append("api_key", apiKey);
    form.append("timestamp", String(timestamp));
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      await logError("cloudinary: delete failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    await logError("cloudinary: delete error", err);
  }
}
