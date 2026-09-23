// Self-check for the marker validation/escaping — player text ends up as
// HTML inside BlueMap's marker popups. Run: npx tsx lib/map-markers.check.ts
import assert from "node:assert/strict";
import { buildPlayerMarkerSet, validateMarker, type MarkerInput } from "./map-markers";

const base: MarkerInput = { label: "Ню-Ріно", type: "CITY", description: "", discordInvite: "", x: 10, y: 64, z: -20, durationDays: null, color: null, icon: null };
const ok = (i: Partial<MarkerInput>) => !("error" in validateMarker({ ...base, ...i }));

assert.ok(ok({}));
assert.ok(!ok({ label: "a" }), "label too short");
assert.ok(!ok({ label: "<img src=x onerror=alert(1)>" }), "markup in label");
assert.ok(!ok({ x: 5001 }), "outside world border");
assert.ok(!ok({ y: 1.5 }), "non-integer");
assert.ok(ok({ durationDays: 30 }));
assert.ok(ok({ color: "#FF00aa", icon: "🏯" }));
assert.ok(!ok({ color: "red" }) && !ok({ color: '#fff" onload="x' }), "bad color");
assert.ok(!ok({ icon: "<svg>" }), "icon not from the list");
assert.ok(!ok({ durationDays: 0 }) && !ok({ durationDays: 1000 }) && !ok({ durationDays: 2.5 }), "bad duration");
assert.ok(ok({ discordInvite: "https://discord.gg/abc123" }));
assert.ok(ok({ discordInvite: "https://discord.com/invite/abc-123" }));
assert.ok(!ok({ discordInvite: 'https://discord.gg/x" onclick="alert(1)' }), "quote injection in invite");
assert.ok(!ok({ discordInvite: "javascript:alert(1)" }), "non-discord link");
// Invite is dropped (not rejected) for non-city types.
const farm = validateMarker({ ...base, type: "FARM", discordInvite: "https://discord.gg/abc123" });
assert.ok(!("error" in farm) && farm.discordInvite === null);

const set = buildPlayerMarkerSet([
  { id: "m1", label: "Test", type: "CITY", description: "<script>alert(1)</script>", discordInvite: null, x: 1, y: 2, z: 3, nickname: "a&b", expiresAt: null, color: null, icon: null },
]);
const detail = set.markers["player-m1"].detail;
assert.ok(!detail.includes("<script>") && detail.includes("&lt;script&gt;"), "description escaped");
assert.ok(detail.includes("a&amp;b"), "nickname escaped");

console.log("map-markers: all checks passed");
