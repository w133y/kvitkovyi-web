// Extracts cosmetic model+texture pairs from an admin-uploaded pack zip.
//
// The source packs in models/ don't agree on a single schema — Plants_
// Furniture_Set.zip ships a native Nexo items.yml (resource/behaviours),
// while Hat_Cosmetics_Pack_Replanus_Store.zip only ships configs for
// CosmeticsCore/ItemsAdder/Oraxen (no Nexo folder at all) — three
// different item-definition dialects this app has no reason to all
// understand. What's actually consistent across every pack, regardless of
// which plugin it was authored for, is the underlying asset: a vanilla
// Java block-model JSON (elements/faces/uv — verified against this
// project's real packs, see components/cosmetics/ModelViewer3D.tsx) next
// to its PNG texture. So parsing here targets THAT directly — find every
// model JSON + its texture, however the zip happens to be organized — and
// leaves naming/typing to the admin's confirm step (lib/cosmetics/
// translate.ts suggests, never decides).

import AdmZip from "adm-zip";

const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100MB — zip-bomb guard
const MAX_ENTRIES = 5000;

export type ParsedPackModel = {
  // Filename-derived, sanitized to COSMETIC_ITEM_ID_RE's shape — a
  // starting point for the admin to edit, not a final id.
  suggestedId: string;
  modelJson: unknown;
  textureBuffer: Buffer;
};

function sanitizeId(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function isBlockModelJson(data: unknown): data is { elements: unknown[]; textures: Record<string, string> } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { elements?: unknown }).elements) &&
    typeof (data as { textures?: unknown }).textures === "object"
  );
}

export function parseNexoPack(zipBuffer: Buffer): ParsedPackModel[] {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length > MAX_ENTRIES) {
    throw new Error(`Пак містить забагато файлів (${entries.length} > ${MAX_ENTRIES})`);
  }

  let totalSize = 0;
  for (const entry of entries) {
    // Zip-slip: every write this app does later uses paths it constructs
    // itself, never a raw entryName, but a path escaping the archive root
    // is a sign of a malformed/hostile zip regardless — reject outright
    // rather than silently ignoring it.
    if (entry.entryName.includes("..")) {
      throw new Error("Пак містить недопустимий шлях файлу");
    }
    totalSize += entry.header.size;
    if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error("Пак завеликий після розпакування");
    }
  }

  const jsonEntries = entries.filter((e) => !e.isDirectory && e.entryName.endsWith(".json"));
  // All PNGs, keyed by filename only (not full path) — pack layouts nest
  // textures under different folder conventions per plugin dialect (see
  // header comment), but every real texture reference resolves by its
  // basename in practice.
  const texturesByName = new Map(
    entries.filter((e) => !e.isDirectory && e.entryName.endsWith(".png")).map((e) => [e.name, e])
  );

  const results: ParsedPackModel[] = [];
  for (const entry of jsonEntries) {
    let data: unknown;
    try {
      data = JSON.parse(zip.readAsText(entry));
    } catch {
      continue; // not JSON, or not UTF-8 — skip, not every .json in a pack is a model
    }
    if (!isBlockModelJson(data)) continue;

    const textureId = Object.values(data.textures)[0];
    if (typeof textureId !== "string") continue;
    const textureName = textureId.split("/").pop() + ".png";
    const textureEntry = texturesByName.get(textureName);
    if (!textureEntry) continue;

    const textureBuffer = zip.readFile(textureEntry);
    if (!textureBuffer) continue;

    results.push({ suggestedId: sanitizeId(entry.name), modelJson: data, textureBuffer });
  }

  return results;
}
