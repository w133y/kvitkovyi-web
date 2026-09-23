// Thin client for Kinetic Panel's (Pterodactyl-based) client API — the way
// the site can act on the live Minecraft server without RCON. sendServerCommand
// sends a command into the server's console exactly like typing it there
// directly; the file functions below it read/write files on the same
// server's disk (plugin configs, resource pack assets). The API token this
// uses can run ANY console command and touch ANY file the server process
// can, so every caller here must build its own command/path from validated,
// narrow inputs — never pass through free-text from a client request
// unescaped.

import { logError } from "@/lib/admin-log";

function getConfig() {
  const baseUrl = process.env.KINETIC_API_BASE_URL;
  const token = process.env.KINETIC_API_TOKEN;
  const serverId = process.env.KINETIC_SERVER_ID;
  if (!baseUrl || !token || !serverId) {
    throw new Error("Kinetic Panel API не налаштовано (перевірте .env)");
  }
  return { baseUrl, token, serverId };
}

export async function sendServerCommand(command: string): Promise<void> {
  const { baseUrl, token, serverId } = getConfig();

  const res = await fetch(`${baseUrl}/servers/${serverId}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logError("kinetic: sendServerCommand failed", res.status, body);
    throw new Error(`Не вдалося надіслати команду на сервер (${res.status})`);
  }
}

// The rest of this file is the same Pterodactyl client API's file
// endpoints, used by the cosmetics admin upload flow (lib/cosmetics/*) to
// push a Nexo item/model/texture straight into the plugin's own folders.
// Same rule as sendServerCommand above: every path/filename reaching these
// must be validated first, never free text from a request body — this is a
// filesystem write on the live production server, not a sandbox.

export type KineticFileEntry = { name: string; isFile: boolean };

export async function listServerFiles(directory: string): Promise<KineticFileEntry[]> {
  const { baseUrl, token, serverId } = getConfig();
  const res = await fetch(
    `${baseUrl}/servers/${serverId}/files/list?directory=${encodeURIComponent(directory)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logError("kinetic: listServerFiles failed", res.status, body);
    throw new Error(`Не вдалося прочитати список файлів (${res.status})`);
  }
  const data = (await res.json()) as { data: { attributes: { name: string; is_file: boolean } }[] };
  return data.data.map((item) => ({ name: item.attributes.name, isFile: item.attributes.is_file }));
}

export async function readServerFile(path: string): Promise<string> {
  const { baseUrl, token, serverId } = getConfig();
  const res = await fetch(
    `${baseUrl}/servers/${serverId}/files/contents?file=${encodeURIComponent(path)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logError("kinetic: readServerFile failed", res.status, body);
    throw new Error(`Не вдалося прочитати файл (${res.status})`);
  }
  return res.text();
}

// Writes/overwrites a single text or binary file. Pterodactyl's write
// endpoint takes the raw body at ?file=<path> — no multipart, no directory
// auto-create for missing parents (the target directory must already
// exist), which is fine here since every write target is a fixed,
// already-existing plugin subfolder.
export async function writeServerFile(path: string, content: string | Buffer): Promise<void> {
  const { baseUrl, token, serverId } = getConfig();
  const res = await fetch(
    `${baseUrl}/servers/${serverId}/files/write?file=${encodeURIComponent(path)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: typeof content === "string" ? content : new Uint8Array(content),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logError("kinetic: writeServerFile failed", res.status, body);
    throw new Error(`Не вдалося записати файл (${res.status})`);
  }
}

// A signed, time-limited URL to download one server file's raw bytes —
// used to fetch a plugin jar for inspection (already how the Nexo/HMC
// command syntax and SimpleCurrency's config were verified for this
// feature), not part of the regular grant/publish flow.
export async function getServerFileDownloadUrl(path: string): Promise<string> {
  const { baseUrl, token, serverId } = getConfig();
  const res = await fetch(
    `${baseUrl}/servers/${serverId}/files/download?file=${encodeURIComponent(path)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logError("kinetic: getServerFileDownloadUrl failed", res.status, body);
    throw new Error(`Не вдалося отримати посилання на файл (${res.status})`);
  }
  const data = (await res.json()) as { attributes: { url: string } };
  return data.attributes.url;
}
