// Thin client for Donatello's donation-history API — used to verify Флорист/
// Меценат payments by polling for a donation whose message contains the
// buyer's order code (see lib/actions/donate-order.ts). Donatello has no
// webhook, so this is the only way to confirm a donation went through.

export type DonatelloDonate = {
  pubId: string;
  clientName: string;
  message: string;
  amount: string; // whole hryvnias as a string, e.g. "99"
  currency: string; // e.g. "UAH"
  isPublished: boolean;
  createdAt: string;
};

// Public donation page donors are sent to — shown as a link/button on the
// payment page, not part of the API.
export const DONATELLO_PAGE_URL = "https://donatello.to/w1z4r_d";

export async function fetchRecentDonates(size = 30): Promise<DonatelloDonate[]> {
  const key = process.env.DONATELLO_API_KEY;
  if (!key) {
    throw new Error("Donatello API не налаштовано (перевірте .env)");
  }

  const res = await fetch(`https://donatello.to/api/v1/donates?page=0&size=${size}`, {
    headers: { "X-Token": key },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("donatello: fetchRecentDonates failed", res.status, body);
    throw new Error(`Не вдалося отримати список донатів (${res.status})`);
  }

  const data = (await res.json()) as { content?: DonatelloDonate[] };
  return data.content ?? [];
}
