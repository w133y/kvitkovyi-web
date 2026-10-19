// Self-check for lib/cosmetics/nexo-pack.ts: npx tsx scripts/check-nexo-pack.mts
// The real-pack checks need the purchased packs in models/ — git-ignored
// (their licenses forbid redistribution), so they're skipped without them.
import fs from "fs";
import assert from "assert";
import { parseNexoPack, withSelfDrop, toNexoFurniture } from "../lib/cosmetics/nexo-pack";

const PACKS = ["elitecreatures-medieval_tavern_furniture_v1", "Medieval-Market-Furniture-Set"];
if (PACKS.every((p) => fs.existsSync(`models/${p}.zip`))) {
  const pack = (name: string) => parseNexoPack(fs.readFileSync(`models/${name}.zip`));
  const find = (models: ReturnType<typeof pack>, id: string) => {
    const m = models.find((x) => x.suggestedId === id);
    assert(m, `${id} not parsed`);
    return m;
  };

  // Oraxen: {x,y,z} barriers, seat height, light placed above the barrier.
  const tavern = pack("elitecreatures-medieval_tavern_furniture_v1");
  const chair = find(tavern, "bar_chair").mechanics!.furniture;
  assert.deepEqual(chair.hitbox, { barriers: ["0,0,0"] });
  assert.deepEqual(chair.seats, ["0,0.72,0"]);
  assert.equal(chair.type, undefined);

  // Multi-texture model: every texture kept, refs rewritten to tex markers.
  const shelf = find(tavern, "shelf_2");
  assert(shelf.textures.length > 1);
  const refs = Object.values((shelf.modelJson as { textures: Record<string, string> }).textures);
  assert(refs.every((r) => r.startsWith("#") || /^kvitkovyi:tex\d+$/.test(r)));

  // ItemsAdder-only pack: hitbox width 3 → three barriers, sounds, rotation.
  const stall = find(pack("Medieval-Market-Furniture-Set"), "medieval_market_stalltable").mechanics!.furniture;
  assert.deepEqual(stall.hitbox, { barriers: ["-1,0,0", "0,0,0", "1,0,0"] });
  assert.deepEqual(stall.block_sounds, { place_sound: "block.wood.place", break_sound: "block.wood.break" });
  assert.equal(stall.restricted_rotation, "STRICT");
} else {
  console.log("nexo-pack: models/ packs missing — skipping the real-pack checks");
}

// Oraxen light next to a barrier goes one block up, Nexo's nested format.
assert.deepEqual(toNexoFurniture({ barrier: true, light: 15 }).lights, { lights: ["0,1,0 15"] });
assert.deepEqual(toNexoFurniture({ light: 20 }).lights, { lights: ["0,0,0 15"] });
// A ceiling-only lamp lights the cell below it, not the ceiling block above.
assert.deepEqual(
  toNexoFurniture({ barrier: true, light: 10, limited_placing: { roof: true, floor: false } }).lights,
  { lights: ["0,-1,0 10"] }
);

// Non-solid furniture still gets a clickable (interaction) hitbox.
assert.deepEqual(toNexoFurniture({ barrier: false }).hitbox, { interactions: ["0,0,0 1,1"] });

// Self-drop replaces the pack's own (possibly typo'd) id, adds one if missing.
const dropped = withSelfDrop({ furniture: { drop: { loots: [{ oraxen_item: "typo", probability: 1 }] } } }, "x_1");
assert.deepEqual(dropped.furniture.drop, { loots: [{ probability: 1, nexo_item: "x_1" }] });
assert.deepEqual(withSelfDrop({ furniture: {} }, "x_1").furniture.drop, { loots: [{ probability: 1, nexo_item: "x_1" }] });

console.log("nexo-pack: ok");
