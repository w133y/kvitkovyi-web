// One LLM call per uploaded model: suggest a Ukrainian display name and a
// CosmeticType from whatever name the source pack used (often Russian or
// English — see the packs in models/). A plain fetch to the Messages API
// rather than pulling in the SDK for a single call.
//
// This is a SUGGESTION only — lib/actions/cosmetics-admin.ts pre-fills an
// editable form field with it, never publishes on its own. A wrong
// auto-translation on a paid item's name is a real embarrassment, not a
// background inference error, so nothing here is trusted un-reviewed.

import { logError } from "@/lib/admin-log";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const COSMETIC_TYPES = ["HAT", "BACKPACK", "BALLOON", "FURNITURE"] as const;
export type CosmeticTypeSuggestion = (typeof COSMETIC_TYPES)[number];

export type TranslateSuggestion = { name: string; type: CosmeticTypeSuggestion };

// Falls back to a pass-through (raw name, FURNITURE) on any failure —
// upload/publish must still work with the API key unset or the call
// failing; the admin can always type the name/type in by hand.
export async function suggestCosmeticNameAndType(rawName: string): Promise<TranslateSuggestion> {
  const fallback: TranslateSuggestion = { name: rawName, type: "FURNITURE" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 100,
        system:
          "You name Minecraft cosmetic/furniture shop items for a Ukrainian server. " +
          'Reply with ONLY a JSON object: {"name": "<short Ukrainian display name>", "type": "HAT"|"BACKPACK"|"BALLOON"|"FURNITURE"}. ' +
          "No other text.",
        messages: [{ role: "user", content: `Item id/filename: ${rawName}` }],
      }),
    });
    if (!res.ok) {
      await logError("cosmetics/translate: API error", res.status, await res.text().catch(() => ""));
      return fallback;
    }
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as { name?: unknown; type?: unknown };
    const type = COSMETIC_TYPES.includes(parsed.type as CosmeticTypeSuggestion)
      ? (parsed.type as CosmeticTypeSuggestion)
      : fallback.type;
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : fallback.name;
    return { name, type };
  } catch (err) {
    await logError("cosmetics/translate: failed", err);
    return fallback;
  }
}
