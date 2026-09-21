import type { Metadata } from "next";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import "./globals.css";

// (site)/layout.tsx is this app's only root layout (it renders <html>/<body>
// itself — there's no separate top-level app/layout.tsx), so it never
// applies to a genuinely unmatched URL, which Next resolves before any
// route (and therefore any group) matches. global-not-found.tsx bypasses
// normal rendering entirely, which is why it has to bring its own fonts,
// stylesheet, and header/footer instead of inheriting (site)'s.
export const metadata: Metadata = {
  title: "Сторінку не знайдено - Квітковий",
};

export default function GlobalNotFound() {
  return (
    <html lang="uk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Ubuntu+Sans:ital,wght@0,100..800;1,100..800&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body suppressHydrationWarning>
        <SiteHeader heroImage="404" />
        <main className="site-main"></main>
        <SiteFooter />
      </body>
    </html>
  );
}
