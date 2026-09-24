import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import UserMenu from "@/components/auth/UserMenu";
import UserMenuSkeleton from "@/components/auth/UserMenuSkeleton";
import ResumeDonatePrompt from "@/components/shop/ResumeDonatePrompt";
import { CartProvider } from "@/lib/cart/CartContext";
import { auth } from "@/lib/auth";
import { getHiddenPagesForViewer } from "@/lib/page-access";
import "../globals.css";

export const metadata: Metadata = {
  title: "Квітковий",
  icons: {
    icon: "/icon.ico",
  },
};

// Tints iOS Safari's status/toolbar areas to the page background (--bg-page)
// instead of white.
export const viewport: Viewport = {
  themeColor: "#141414",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, hiddenPages] = await Promise.all([auth(), getHiddenPagesForViewer()]);

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
      {/* suppressHydrationWarning: some browser extensions / the VS Code
          Simple Browser inject a class (e.g. "vsc-initialized") onto body
          before React hydrates — harmless, but React would otherwise flag
          it as a mismatch. See https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>
        <CartProvider>
          <SiteHeader
            hiddenPages={hiddenPages}
            userMenu={
              <Suspense fallback={<UserMenuSkeleton />}>
                <UserMenu session={session} />
              </Suspense>
            }
          />
          <main className="site-main">{children}</main>
          <SiteFooter />
          {session && <ResumeDonatePrompt />}
        </CartProvider>
        <Script async src="https://www.googletagmanager.com/gtag/js?id=AW-17089484935" />
        <Script id="gtag-init">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17089484935');
          `}
        </Script>
      </body>
    </html>
  );
}
