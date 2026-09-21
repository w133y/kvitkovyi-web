// Shared between the client-side price preview (components/shop/DonateBuilder.tsx)
// and the server-side order total (lib/actions/donate-order.ts) — plain,
// synchronous, no "use server", so both can import it directly instead of
// duplicating the math and letting the two drift apart.

export type DonateTierKey = "FLORIST" | "MECENAT";

export const TIER_PRICE_UAH: Record<DonateTierKey, number> = {
  FLORIST: 49,
  MECENAT: 99,
};

export const MIN_DONATE_MONTHS = 1;
export const MAX_DONATE_MONTHS = 6;

// 5% off committing to 5 months, 10% off 6 — no discount for anything
// shorter, rather than a step at every month.
export function durationDiscount(months: number): number {
  if (months >= 6) return 0.1;
  if (months >= 5) return 0.05;
  return 0;
}

export function calculateDonateAmount(tier: DonateTierKey, months: number): number {
  return Math.round(TIER_PRICE_UAH[tier] * months * (1 - durationDiscount(months)));
}
