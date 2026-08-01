import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "better-sqlite3", "nodemailer"],
  experimental: {
    serverActions: {
      // Course materials and film clips can be large.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
