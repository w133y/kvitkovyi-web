import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import ScrollReveal from "@/components/layout/ScrollReveal";
import CookieConsent from "@/components/layout/CookieConsent";
import UserMenu from "@/components/auth/UserMenu";
import UserMenuSkeleton from "@/components/auth/UserMenuSkeleton";
import ResumeDonatePrompt from "@/components/shop/ResumeDonatePrompt";
import { CartProvider } from "@/lib/cart/CartContext";
import { getSession } from "@/lib/auth";
import { getHiddenPagesForViewer } from "@/lib/page-access";
import { ubuntuSans } from "@/lib/fonts";
import "../fontawesome.css";
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
  const [session, hiddenPages] = await Promise.all([getSession(), getHiddenPagesForViewer()]);

  return (
    <html lang="uk" className={ubuntuSans.variable}>
      {/* suppressHydrationWarning: some browser extensions / the VS Code
          Simple Browser inject a class (e.g. "vsc-initialized") onto body
          before React hydrates — harmless, but React would otherwise flag
          it as a mismatch. See https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>
        <CartProvider>
          {/* Header + content fill at least the first screen, so the footer
              always starts below the fold (see .site-page). */}
          <div className="site-page">
            <SiteHeader
              hiddenPages={hiddenPages}
              userMenu={
                <Suspense fallback={<UserMenuSkeleton />}>
                  <UserMenu session={session} />
                </Suspense>
              }
            />
            <main className="site-main">{children}</main>
          </div>
          <ScrollReveal />
          <SiteFooter />
          {session && <ResumeDonatePrompt />}
        </CartProvider>
        {/* Google Ads tag loads only after consent — see CookieConsent. */}
        <CookieConsent />
      </body>
    </html>
  );
}
