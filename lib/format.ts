// Deliberately not using Intl.NumberFormat's `style: "currency"` here — its
// output (symbol vs currency code, spacing) can differ between the server's
// Node ICU build and the browser's, which caused React hydration mismatches.
const CURRENCY_LABELS: Record<string, string> = {
  UAH: "грн",
  USD: "$",
  EUR: "€",
};

export function formatPrice(cents: number, currency = "UAH") {
  const amount = (cents / 100).toFixed(2).replace(".", ",");
  const label = CURRENCY_LABELS[currency] ?? currency;
  return `${amount} ${label}`;
}
