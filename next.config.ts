import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // (site)/layout.tsx is this app's only root layout (it renders its own
    // <html>/<body> — there's no separate top-level app/layout.tsx), so a
    // plain app/not-found.tsx sits outside it and Next falls back to its own
    // bare-bones builtin layout for genuinely unmatched URLs, with none of
    // the site's fonts/header/footer. global-not-found.tsx is exactly the
    // documented escape hatch for "one root layout, but it's inside a route
    // group" (see node_modules/next/dist/docs/.../not-found.md).
    globalNotFound: true,
    serverActions: {
      // Default is 1MB — submitGalleryPhoto (lib/actions/gallery.ts) allows
      // photos up to 10MB, so the default was rejecting every upload above
      // 1MB with a 413 before the action ever ran. A bit of headroom above
      // 10MB for multipart boundary/header overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
