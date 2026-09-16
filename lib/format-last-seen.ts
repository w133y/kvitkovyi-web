// Shared by the leaderboard row and the profile page's online/last-seen
// label — both work from the same play_time.last_seen (epoch ms).

// No live presence check exists (nothing pings the server) — "online" is
// inferred from a recent last_seen, same idea as the leaderboard's "щойно".
// Plan updates it periodically during an active session, not just on quit,
// so a few-minute window is a reasonable proxy without being trigger-happy
// on a stale value.
const ONLINE_THRESHOLD_MS = 5 * 60_000;

export function isOnline(ts: number | null): boolean {
  return ts != null && Date.now() - ts < ONLINE_THRESHOLD_MS;
}

export function formatLastSeen(ts: number | null): string {
  if (!ts) return "немає даних";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "щойно";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  return `${days} дн. тому`;
}

export type Pronoun = "he" | "she" | "they";

export const PRONOUN_OPTIONS: { value: Pronoun; label: string }[] = [
  { value: "he", label: "Він" },
  { value: "she", label: "Вона" },
  { value: "they", label: "Вони" },
];

// Picks the grammatical gender of the "last seen" past-tense verb from the
// profile owner's chosen pronoun (User.pronoun) — never shown as its own
// label, it only changes this one word. No preference set (the vast
// majority of accounts) keeps the masculine default the site always used.
export function lastSeenVerb(pronoun: string | null | undefined): string {
  if (pronoun === "she") return "Заходила";
  if (pronoun === "they") return "Заходили";
  return "Заходив";
}
