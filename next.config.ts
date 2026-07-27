import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    serverActions: {
      // Supabase's request-files bucket allows up to 50 MiB per object.
      // Keep a small allowance for multipart fields and payload metadata.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
