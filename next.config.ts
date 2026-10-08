import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/\/api\/auth\/google\/callback/],
    },
  },
};

export default nextConfig;
