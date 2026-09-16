// Thin client for Kinetic Panel's (Pterodactyl-based) client API — the way
// the site can act on the live Minecraft server without RCON: this sends a
// command into the server's console exactly like typing it there directly.
// The API token this uses can run ANY console command, so every caller here
// must build its own command from validated, narrow inputs — never pass
// through free-text from a client request unescaped.

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
