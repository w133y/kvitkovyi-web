// Extracts cosmetic model+texture sets from an admin-uploaded pack zip.
//
// The source packs in models/ don't agree on a single schema — some ship a
// native Nexo items.yml, others only configs for CosmeticsCore/ItemsAdder/
// Oraxen. What's actually consistent across every pack, regardless of
// which plugin it was authored for, is the underlying asset: a vanilla
// Java block-model JSON (elements/faces/uv — verified against this
// project's real packs, see components/cosmetics/ModelViewer3D.tsx) next
// to its PNG textures. So parsing here targets THAT directly — find every
// model JSON + its textures, however the zip happens to be organized — and
// leaves naming/typing to the admin's confirm step (lib/cosmetics/
// translate.ts suggests, never decides).
//
// The one part of a pack's own config worth keeping is a furniture's
// Mechanics (seats, multi-block hitboxes, doors, lights…) — the generic
// one-barrier default in publish.ts loses all of that. Nexo, Oraxen and
// ItemsAdder configs all name the item's model path, so it's matched back
// to the model JSON by filename and converted to Nexo's schema (see
// toNexoFurniture / fromItemsAdder).

import AdmZip from "adm-zip";
import { parse } from "yaml";

const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100MB — zip-bomb guard
const MAX_ENTRIES = 5000;

type Furniture = Record<string, unknown>;
export type SourceMechanics = { furniture: Furniture };

export type ParsedPackModel = {
  // Filename-derived, sanitized to COSMETIC_ITEM_ID_RE's shape — a
  // starting point for the admin to edit, not a final id.
  suggestedId: string;
  // Texture variables rewritten to "kvitkovyi:tex<n>" (lib/cosmetics/
  // asset-url.ts), n indexing `textures`.
  modelJson: unknown;
  // mcmeta: the texture's animation file (.png.mcmeta), if it has one.
  textures: { png: Buffer; mcmeta?: string }[];
  // The pack's own furniture Mechanics in Nexo's schema — absent when the
  // pack ships no Nexo/Oraxen/ItemsAdder config for this model.
  mechanics?: SourceMechanics;
  // The pack's own display name, a better translation input than the id.
  displayName?: string;
};

function sanitizeId(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

// Some packs are zipped on Windows with "\" separators.
const entryPath = (e: AdmZip.IZipEntry) => e.entryName.replace(/\\/g, "/");
const baseName = (path: string) => path.split("/").pop()!;
// Several packs ship the same models/configs once per plugin — the Nexo
// copy wins, then Oraxen's (exact barrier lists), then anything else.
const sourceRank = (e: AdmZip.IZipEntry) => (/nexo/i.test(entryPath(e)) ? 0 : /oraxen/i.test(entryPath(e)) ? 1 : 2);
const bySource = (a: AdmZip.IZipEntry, b: AdmZip.IZipEntry) => sourceRank(a) - sourceRank(b);

function isBlockModelJson(data: unknown): data is { elements: unknown[]; textures: Record<string, string> } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { elements?: unknown }).elements) &&
    typeof (data as { textures?: unknown }).textures === "object"
  );
}

type Xyz = { x?: number; y?: number; z?: number };
const xyz = (b: unknown) => (typeof b === "string" ? b : `${(b as Xyz).x ?? 0},${(b as Xyz).y ?? 0},${(b as Xyz).z ?? 0}`);

// Seat heights, calibrated against LivingRoomFurnitures, which ships the
// same chairs in all three schemas: Nexo y = Oraxen seat.height + 0.6 =
// ItemsAdder sit_height - 0.4.
const ORAXEN_SEAT_OFFSET = 0.6;
const ITEMSADDER_SEAT_OFFSET = -0.4;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Nexo's light block can't share a cell with a barrier (its own bundled
// example lights "0,1,0" above a "0,0,0" barrier), so it goes in the first
// free cell of the column above the origin.
function lightsFor(level: number, hitbox: unknown): Furniture {
  const barriers = ((hitbox as { barriers?: string[] } | undefined)?.barriers ?? []).map((b) => b.replace(/\s/g, ""));
  let y = 0;
  while (barriers.includes(`0,${y},0`)) y++;
  return { lights: [`0,${y},0 ${Math.min(15, level)}`] };
}

// Oraxen's furniture schema (also used by older Nexo packs) → Nexo 1.28's.
// Nexo-native keys don't collide with any of these, so a Nexo config
// passes through unchanged.
export function toNexoFurniture(furniture: Furniture): Furniture {
  const {
    type: _type,
    rotation: _rotation,
    barrier,
    barriers,
    light,
    seat,
    display_entity_properties,
    ...rest
  } = furniture;
  const out: Furniture = { ...rest };

  const hitbox = (rest.hitbox ?? {}) as { width?: number; height?: number };
  if (!["barriers", "interactions", "shulkers", "ghasts"].some((k) => k in hitbox)) {
    if (Array.isArray(barriers)) out.hitbox = { barriers: barriers.map(xyz) };
    else if (barrier === true) out.hitbox = { barriers: ["0,0,0"] };
    else out.hitbox = { interactions: [`0,0,0 ${hitbox.width ?? 1},${hitbox.height ?? hitbox.width ?? 1}`] };
  }
  if (typeof light === "number" && !out.lights) out.lights = lightsFor(light, out.hitbox);
  const seatHeight = (seat as { height?: number } | undefined)?.height;
  if (typeof seatHeight === "number" && !out.seats) out.seats = [`0,${round2(seatHeight + ORAXEN_SEAT_OFFSET)},0`];
  if (display_entity_properties && !out.properties) out.properties = display_entity_properties;
  if (out.limited_placing) {
    const { type: _t, ...placing } = out.limited_placing as Record<string, unknown>;
    out.limited_placing = placing;
  }
  return out;
}

// One axis of an ItemsAdder hitbox (size + offset, in blocks, centered on
// the placed block) → the block offsets it covers.
function spread(size = 1, offset = 0): number[] {
  const n = Math.max(1, Math.ceil(size - 1e-6));
  return Array.from({ length: n }, (_, i) => Math.round(i - (n - 1) / 2 + offset));
}

type IaBehaviours = {
  furniture?: {
    solid?: boolean;
    fixed_rotation?: boolean;
    light_level?: number;
    placeable_on?: { floor?: boolean; ceiling?: boolean; walls?: boolean };
    hitbox?: { length?: number; width?: number; height?: number; length_offset?: number; width_offset?: number; height_offset?: number };
    sound?: { place?: { name?: string }; break?: { name?: string } };
  };
  furniture_sit?: { sit_height?: number };
};

function fromItemsAdder(b: IaBehaviours): Furniture {
  const f = b.furniture ?? {};
  const out: Furniture = {};
  if (f.placeable_on) {
    out.limited_placing = {
      floor: f.placeable_on.floor ?? true,
      roof: f.placeable_on.ceiling ?? false,
      wall: f.placeable_on.walls ?? false,
    };
  }
  const h = f.hitbox ?? {};
  if (f.solid !== false) {
    const barriers: string[] = [];
    for (const y of spread(h.height, h.height_offset).map((v) => v - spread(h.height)[0]))
      for (const x of spread(h.width, h.width_offset))
        for (const z of spread(h.length, h.length_offset)) barriers.push(`${x},${y},${z}`);
    out.hitbox = { barriers };
  } else {
    // Walk-through, but still has to be clickable to break or sit on.
    out.hitbox = { interactions: [`0,0,0 ${h.width ?? 1},${h.height ?? 1}`] };
  }
  if (f.fixed_rotation) out.restricted_rotation = "STRICT";
  if (typeof f.light_level === "number") out.lights = lightsFor(f.light_level, out.hitbox);
  if (f.sound?.place?.name || f.sound?.break?.name) {
    out.block_sounds = {
      ...(f.sound.place?.name ? { place_sound: f.sound.place.name } : {}),
      ...(f.sound.break?.name ? { break_sound: f.sound.break.name } : {}),
    };
  }
  const sit = b.furniture_sit?.sit_height;
  if (typeof sit === "number") out.seats = [`0,${round2(sit + ITEMSADDER_SEAT_OFFSET)},0`];
  return out;
}

function sourceMechanicsByModel(zip: AdmZip, ymlEntries: AdmZip.IZipEntry[]) {
  const byModel = new Map<string, { mechanics: SourceMechanics; displayName?: string }>();
  const add = (modelPath: unknown, furniture: Furniture, name: unknown) => {
    if (typeof modelPath !== "string") return;
    const id = sanitizeId(baseName(modelPath));
    // Minecraft formatting tags/codes ("<white>", "&7") aren't part of the name.
    const displayName = typeof name === "string" ? name.replace(/<[^>]*>|&[0-9a-fk-or]/gi, "").trim() : "";
    if (!byModel.has(id)) byModel.set(id, { mechanics: { furniture }, ...(displayName ? { displayName } : {}) });
  };
  for (const entry of [...ymlEntries].sort(bySource)) {
    let doc: unknown;
    try {
      doc = parse(zip.readAsText(entry));
    } catch {
      continue; // some packs ship malformed YAML for one of their plugins
    }
    if (typeof doc !== "object" || doc === null) continue;
    const { info, items } = doc as { info?: unknown; items?: Record<string, unknown> };
    if (info && items && typeof items === "object") {
      // ItemsAdder: info/items wrapper, resource.model_path + behaviours.
      for (const item of Object.values(items)) {
        const cfg = item as { display_name?: unknown; resource?: { model_path?: unknown }; behaviours?: IaBehaviours } | null;
        if (cfg?.behaviours?.furniture) add(cfg.resource?.model_path, fromItemsAdder(cfg.behaviours), cfg.display_name);
      }
      continue;
    }
    for (const item of Object.values(doc)) {
      const cfg = item as {
        itemname?: unknown;
        displayname?: unknown;
        Pack?: { model?: unknown };
        Mechanics?: { furniture?: unknown };
      } | null;
      const furniture = cfg?.Mechanics?.furniture;
      if (typeof furniture === "object" && furniture !== null)
        add(cfg?.Pack?.model, toNexoFurniture(furniture as Furniture), cfg?.itemname ?? cfg?.displayname);
    }
  }
  return byModel;
}

// A pack's drop config names its own item id — every source pack drops the
// furniture itself, so loots are pointed at the id this app assigned (one
// living-room item even ships a typo'd id that would drop nothing), and a
// config without any drop (ItemsAdder's) gets that same self-drop.
export function withSelfDrop(mechanics: SourceMechanics, nexoItemId: string): SourceMechanics {
  const furniture = { ...mechanics.furniture };
  const drop = (furniture.drop as { loots?: Record<string, unknown>[] } | undefined) ?? {};
  const loots: Record<string, unknown>[] = drop.loots?.length ? drop.loots : [{ probability: 1.0 }];
  furniture.drop = {
    ...drop,
    loots: loots.map(({ oraxen_item: _o, nexo_item: _n, ...loot }) => ({ ...loot, nexo_item: nexoItemId })),
  };
  return { furniture };
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

  const files = entries.filter((e) => !e.isDirectory).sort(bySource);
  // Textures keyed by filename only (not full path) — pack layouts nest
  // them under different folder conventions per plugin dialect, but every
  // real texture reference resolves by its basename in practice. First
  // (highest-ranked source) copy wins.
  const byName = new Map<string, AdmZip.IZipEntry>();
  for (const e of files) {
    const name = baseName(entryPath(e));
    if ((name.endsWith(".png") || name.endsWith(".png.mcmeta")) && !byName.has(name)) byName.set(name, e);
  }
  const mechanics = sourceMechanicsByModel(zip, files.filter((e) => /\.ya?ml$/.test(entryPath(e))));

  const results: ParsedPackModel[] = [];
  const seen = new Set<string>();
  for (const entry of files.filter((e) => entryPath(e).endsWith(".json"))) {
    let data: unknown;
    try {
      data = JSON.parse(zip.readAsText(entry));
    } catch {
      continue; // not JSON, or not UTF-8 — skip, not every .json in a pack is a model
    }
    if (!isBlockModelJson(data)) continue;

    const suggestedId = sanitizeId(baseName(entryPath(entry)));
    if (seen.has(suggestedId)) continue;

    // Each distinct texture becomes one stored texture, in first-seen order.
    const refs = [...new Set(Object.values(data.textures).filter((t) => typeof t === "string" && !t.startsWith("#")))];
    const textures: ParsedPackModel["textures"] = [];
    for (const ref of refs) {
      const name = ref.split("/").pop() + ".png";
      const png = byName.get(name) && zip.readFile(byName.get(name)!);
      if (!png) break;
      const mcmeta = byName.get(name + ".mcmeta");
      textures.push({ png, ...(mcmeta ? { mcmeta: zip.readAsText(mcmeta) } : {}) });
    }
    if (textures.length === 0 || textures.length !== refs.length) continue;

    const modelJson = {
      ...data,
      textures: Object.fromEntries(
        Object.entries(data.textures).map(([key, ref]) => [key, ref.startsWith("#") ? ref : `kvitkovyi:tex${refs.indexOf(ref)}`])
      ),
    };
    seen.add(suggestedId);
    results.push({ suggestedId, modelJson, textures, ...mechanics.get(suggestedId) });
  }

  return results;
}
