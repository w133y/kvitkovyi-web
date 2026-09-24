// Self-check for the bio link filter. Run: npx tsx lib/bio-links.check.ts
import assert from "node:assert/strict";
import { bioContainsLink } from "./bio-links";

for (const text of ["https://x.com", "заходь на www.site", "discord.gg/abc", "мій сайт example.com", "EXAMPLE.ORG", "youtube.com/@me", "t.me/chan"]) {
  assert.ok(bioContainsLink(text), `should block: ${text}`);
}
for (const text of ["Граю з 1.21", "люблю квіти, т.д.", "мер Ню-Ріно", "1234", "e-mail нема", "версія 26.2"]) {
  assert.ok(!bioContainsLink(text), `should allow: ${text}`);
}
console.log("bio: all checks passed");
