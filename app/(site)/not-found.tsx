import type { Metadata } from "next";
import ForceFullHero from "@/components/layout/ForceFullHero";

// Handles an explicit notFound() call thrown inside a matched route (e.g. a
// wiki article whose slug doesn't exist) — rendered inside (site)/layout.tsx
// like any other page, so it already has the site's header/footer/fonts for
// free. Genuinely unmatched URLs (a typo'd path that matches no route at
// all) are a separate case, handled by app/global-not-found.tsx instead,
// since Next resolves those before any layout — including this one — matches.
//
// ForceFullHero reaches back to the layout's already-rendered <header> to
// give it the same full hero + 404.png every other 404 path shows — see
// that component for why a prop can't do this directly.
export const metadata: Metadata = {
  title: "Сторінку не знайдено - Квітковий",
};

export default function NotFound() {
  return <ForceFullHero />;
}
