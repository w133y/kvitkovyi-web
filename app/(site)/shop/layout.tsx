// CartBadge (the generic UAH cart icon) used to live here, but nothing on
// the site adds to that cart anymore — /shop/cosmetics has its own
// self-contained cart panel, and /shop/sponsorship's DonateBuilder never
// used the generic cart at all. Showing an always-empty cart icon was pure
// clutter.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
