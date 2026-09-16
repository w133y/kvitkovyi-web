import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
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
