// Pushes one confirmed CosmeticItem to the live server: model JSON +
// texture into Nexo's resource pack folder, an item definition into a file
// this app owns exclusively (never touching hand-authored files like
// Nexo/items/hmccosmetics.yml), and — for wearable types — an HMCCosmetics
// cosmetics.yml entry, then a single `/nexo reload` (confirmed live to
// reload items + regenerate/re-import the resourcepack in one call).
//
// Schema note (corrected after a real live bug — see below): Nexo/items/
// *.yml files are read flat (item ids directly at the file root, no info:/
// items: wrapper — that wrapper belongs to the pack-DISTRIBUTION format, a
// separate conversion step, not what's loaded at runtime here).
//
// This writes the OLDER Pack:/itemname:/Mechanics: schema, not the newer
// resource:/display_name:/behaviours: one a real commercial Nexo furniture
// pack (models/Plants_Furniture_Set.zip) is itself authored in. That's
// backwards from what "newer schema" implies, but it's what's actually
// live-verified against this server's Nexo 1.28 build: the first version
// of this function used resource:/behaviours: and every item registered
// without error, but never actually rendered in-game (showed as plain
// PAPER) — comparing the generated resourcepack's own output confirmed why:
// Nexo only emits the required assets/nexo/items/<id>.json component-
// mapping file (what the client actually needs to resolve PAPER + this
// item's data into our custom model) for items defined with Pack:, not
// resource:. Switching to Pack:/itemname:/Mechanics: and confirming the
// component file gets generated is what's actually tested here — not just
// "reload doesn't error."

import { parse, stringify } from "yaml";
import { readServerFile, writeServerFile, sendServerCommand } from "@/lib/kinetic";
import { getPublicUrl } from "@/lib/r2";
import { COSMETIC_ITEM_ID_RE } from "@/lib/cosmetics/grant";
import { logError } from "@/lib/admin-log";
import type { CosmeticType } from "@prisma/client";

const NAMESPACE = "kvitkovyi";
const NEXO_ITEMS_FILE = "/plugins/Nexo/items/kvitkovyi.yml";
const HMC_COSMETICS_FILE = "/plugins/HMCCosmetics/cosmetics/kvitkovyi.yml";
const MODEL_BASE = "/plugins/Nexo/pack/assets/kvitkovyi";

const HMC_SLOT: Record<Exclude<CosmeticType, "FURNITURE">, string> = {
  HAT: "HELMET",
  BACKPACK: "BACKPACK",
  // Not yet seen a real balloon example in either downloaded pack — offhand
  // is the common pattern for a held/floating cosmetic in similar plugins,
  // but this is the one slot mapping worth double-checking against a real
  // balloon item the first time one is published.
  BALLOON: "OFFHAND",
};

// Reads a YAML file this app exclusively owns, returning {} if it doesn't
// exist yet (first publish ever) rather than erroring.
async function readOwnedYaml(path: string): Promise<Record<string, unknown>> {
  try {
    const text = await readServerFile(path);
    return (parse(text) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

const HMC_HATS_MENU_FILE = "/plugins/HMCCosmetics/menus/defaultmenu_hats.yml";

// HMCCosmetics menus list every cosmetic explicitly — one merely defined in
// cosmetics/*.yml loads fine but never shows up in /cosmetic. So a published
// hat also gets a button in the hats menu, in the first free slot (column 0
// holds the menu's own category buttons).
// ponytail: single page, 45 free slots; needs paging past that.
export async function addToHatsMenu(hmcId: string, nexoItemId: string): Promise<boolean> {
  const menu = parse(await readServerFile(HMC_HATS_MENU_FILE)) as { items: Record<string, { slots?: number[] }> };
  if (menu.items[hmcId]) return true;
  const used = new Set(Object.values(menu.items).flatMap((i) => i.slots ?? []));
  const slot = Array.from({ length: 54 }, (_, i) => i).find((i) => i % 9 !== 0 && !used.has(i));
  if (slot === undefined) return false;
  menu.items[hmcId] = {
    slots: [slot],
    item: {
      material: `nexo:${nexoItemId}`,
      lore: [
        "",
        `<gray>Одягнено: <#6D9DC5>%HMCCosmetics_equipped_${hmcId}%`,
        `<gray>Доступно: <#6D9DC5>%HMCCosmetics_unlocked_${hmcId}%`,
      ],
    },
    // Shown instead of `item` when the player lacks hmccosmetics.<id> —
    // AIR leaves the slot empty, so the menu only shows purchased hats
    // (confirmed from HMC 2.9.1's TypeCosmetic.setItem bytecode).
    "locked-item": { material: "AIR" },
    type: "cosmetic",
    cosmetic: hmcId,
  } as (typeof menu.items)[string];
  await writeServerFile(HMC_HATS_MENU_FILE, stringify(menu));
  return true;
}

export async function publishCosmeticToServer(item: {
  nexoItemId: string;
  hmcCosmeticId: string | null;
  type: CosmeticType;
  name: string;
  colorCustomizable: boolean;
  modelKey: string;
  textureKey: string;
}): Promise<void> {
  if (!COSMETIC_ITEM_ID_RE.test(item.nexoItemId)) {
    throw new Error("Некоректний id косметики");
  }
  if (item.hmcCosmeticId !== null && !COSMETIC_ITEM_ID_RE.test(item.hmcCosmeticId)) {
    throw new Error("Некоректний hmcCosmeticId");
  }

  const typeSlug = item.type.toLowerCase();
  const modelPath = `${typeSlug}/${item.nexoItemId}`;

  // Push the actual assets — Nexo's own resourcepack generation (part of
  // `/nexo reload`, see lib/kinetic.ts callers) picks these up from its
  // pack/assets folder the same way a real resource pack author would lay
  // them out.
  //
  // Live-verified bug fixed here: the model JSON's own "textures" map still
  // holds whatever namespace:path string the SOURCE pack used (e.g.
  // "lzfurniture:furniture/plants/plants_small_tulip") — Nexo resolves
  // textures by that string, not by wherever the file physically ends up,
  // so writing the PNG under our own kvitkovyi/<modelPath> path while
  // leaving the model's texture reference pointed at the old namespace
  // left Nexo unable to find it ("texture-reference(s) do not exist",
  // confirmed against a real reload). Every texture value is rewritten to
  // our own reference before the model JSON is written, since this schema
  // only ever stores one texture per item (see ModelViewer3D.tsx /
  // nexo-pack.ts, both already only look at the first texture value).
  const [modelJsonText, textureBuffer] = await Promise.all([
    fetch(getPublicUrl(item.modelKey)).then((r) => r.text()),
    fetch(getPublicUrl(item.textureKey)).then((r) => r.arrayBuffer()),
  ]);
  const modelJson = JSON.parse(modelJsonText) as { textures?: Record<string, string> };
  const ourTextureRef = `${NAMESPACE}:${modelPath}`;
  if (modelJson.textures) {
    for (const key of Object.keys(modelJson.textures)) {
      modelJson.textures[key] = ourTextureRef;
    }
  }

  await writeServerFile(`${MODEL_BASE}/models/${modelPath}.json`, JSON.stringify(modelJson));
  await writeServerFile(`${MODEL_BASE}/textures/${modelPath}.png`, Buffer.from(textureBuffer));

  const nexoItems = await readOwnedYaml(NEXO_ITEMS_FILE);
  // A re-publish (admin edit) keeps whatever Mechanics the entry already
  // has — the source packs' barriers/seats/lights were converted into it
  // once and must not be reset to the generic default below.
  const existing = nexoItems[item.nexoItemId] as { Mechanics?: unknown } | undefined;
  nexoItems[item.nexoItemId] = {
    material: item.colorCustomizable ? "LEATHER_HORSE_ARMOR" : "PAPER",
    ...(item.colorCustomizable ? { color: "255, 255, 255" } : {}),
    Pack: { model: `${NAMESPACE}:${modelPath}` },
    itemname: item.name,
    ...(existing && "Mechanics" in existing
      ? { Mechanics: existing.Mechanics }
      : item.type === "FURNITURE"
      ? {
          Mechanics: {
            // Nexo 1.28 keys — a single upload has no source config to
            // convert, so: one solid barrier block, floor-only.
            furniture: {
              hitbox: { barriers: ["0,0,0"] },
              limited_placing: { roof: false, floor: true, wall: false },
            },
          },
        }
      : {}),
  };
  await writeServerFile(NEXO_ITEMS_FILE, stringify(nexoItems));

  if (item.type !== "FURNITURE") {
    const hmcId = item.hmcCosmeticId ?? item.nexoItemId;
    const hmcCosmetics = await readOwnedYaml(HMC_COSMETICS_FILE);
    hmcCosmetics[hmcId] = {
      slot: HMC_SLOT[item.type],
      permission: `hmccosmetics.${hmcId}`,
      item: { material: `nexo:${item.nexoItemId}`, name: item.name, amount: 1 },
      dye: { enabled: item.colorCustomizable },
    };
    await writeServerFile(HMC_COSMETICS_FILE, stringify(hmcCosmetics));
    if (item.type === "HAT" && !(await addToHatsMenu(hmcId, item.nexoItemId))) {
      await logError("cosmetics/publish: hats menu full", hmcId);
    }
  }

  try {
    await sendServerCommand("nexo reload");
  } catch (err) {
    // The files are already written — a failed reload just means the
    // change isn't live yet, not that publishing itself failed. Surfaced
    // to the admin as a warning, not blocking the CosmeticItem's status
    // flip (lib/actions/cosmetics-admin.ts), same way donate-privilege
    // grants treat a Kinetic failure as logged-but-non-fatal.
    await logError("cosmetics/publish: nexo reload failed", item.nexoItemId, err);
  }
}
