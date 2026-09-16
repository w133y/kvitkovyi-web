import { getSkinsRestorerSkin } from "./mc-db";
import { logError } from "@/lib/admin-log";

// Resolves a player's actual skin texture, keyed by UUID. We used to rely on
// crafatar.com (a third-party render cache) but its storage backend has been
// persistently erroring (HTTP 500, "server error") for accounts that resolve
// fine on Mojang's own API, so we fetch the texture ourselves and render it
// client-side with skinview3d instead of depending on crafatar's cache being
// healthy.
export type SkinTexture = {
  skinUrl: string;
  capeUrl: string | null;
  slim: boolean;
};

// Fallback for players with no resolvable skin anywhere (no SkinsRestorer
// entry, no premium Mojang account) — Minecraft's own default skin, bundled
// locally so it always renders regardless of any external service's uptime.
export const STEVE_SKIN: SkinTexture = {
  skinUrl: "/skins/steve.png",
  capeUrl: null,
  slim: false,
};

// Both SkinsRestorer (sr_player_skins.value) and Mojang's session server
// (properties[].value) encode the skin the same way: base64 JSON containing
// a "textures.SKIN.url" (and optionally "textures.CAPE.url"/"metadata.model").
function decodeTextureValue(value: string): SkinTexture | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64").toString("utf-8"));
    const skin = decoded?.textures?.SKIN;
    const cape = decoded?.textures?.CAPE;
    if (!skin?.url) return null;

    return {
      // Mojang serves these as http:// — force https so the browser doesn't
      // block them as mixed content on our https page.
      skinUrl: (skin.url as string).replace(/^http:/, "https:"),
      capeUrl: cape?.url ? (cape.url as string).replace(/^http:/, "https:") : null,
      slim: skin.metadata?.model === "slim",
    };
  } catch {
    return null;
  }
}

export async function getSkinTexture(uuid: string): Promise<SkinTexture | null> {
  const restorerSkin = await getSkinsRestorerSkin(uuid);
  if (restorerSkin) {
    const decoded = decodeTextureValue(restorerSkin.value);
    if (decoded) return decoded;
  }

  try {
    const id = uuid.replace(/-/g, "");
    const res = await fetch(
      `https://sessionserver.mojang.com/session/minecraft/profile/${id}`,
      { next: { revalidate: 3600 } }
    );
    if (res.status !== 200) return null;

    const profile = await res.json();
    const texturesProp = (profile.properties as Array<{ name: string; value: string }> | undefined)?.find(
      (p) => p.name === "textures"
    );
    if (!texturesProp) return null;

    return decodeTextureValue(texturesProp.value);
  } catch (err) {
    await logError("mojang-skin: getSkinTexture failed", err);
    return null;
  }
}
