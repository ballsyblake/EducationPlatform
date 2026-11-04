import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "better-sqlite3", "nodemailer"],
  experimental: {
    serverActions: {
      // Course materials and film clips can be large, and a course register is
      // worse: FQ's B Diploma registers run to 52MB because each one carries
      // twenty-nine embedded photographs of coaches behind a row the
      // spreadsheet renders as `#VALUE!`. 50mb refused one outright.
      bodySizeLimit: "80mb",
    },
  },
};

export default nextConfig;
