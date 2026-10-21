import { Ubuntu_Sans } from "next/font/google";

// Self-hosted by next/font (downloaded at build time, preloaded, no
// render-blocking request to Google Fonts on every page view). CSS uses it
// through var(--font-ubuntu-sans). Upright only, like the Google Fonts link
// this replaced — the one italic in globals.css is synthesized.
export const ubuntuSans = Ubuntu_Sans({
  subsets: ["latin", "cyrillic"],
  variable: "--font-ubuntu-sans",
  display: "swap",
});
