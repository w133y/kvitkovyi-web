import type { Metadata } from "next";
import Image from "next/image";

// Handles an explicit notFound() call thrown inside a matched route (e.g. a
// wiki article whose slug doesn't exist) — rendered inside (site)/layout.tsx
// like any other page, so it already has the site's header/footer/fonts for
// free. Genuinely unmatched URLs (a typo'd path that matches no route at
// all) are a separate case, handled by app/global-not-found.tsx instead,
// since Next resolves those before any layout — including this one — matches.
export const metadata: Metadata = {
  title: "Сторінку не знайдено - Квітковий",
};

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-hero">
        <Image src="/img/404.png" alt="Сторінку не знайдено 404" width={1024} height={150} priority />
      </div>
    </div>
  );
}
