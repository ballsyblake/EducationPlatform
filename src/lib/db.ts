import { PrismaClient } from "@prisma-client";
import { createAdapter } from "@/lib/adapter";

function createClient() {
  return new PrismaClient({
    adapter: createAdapter(),
    // File contents are excluded from every query by default. Course and
    // grading pages list a dozen attachments at a time and only need the
    // metadata; pulling the blobs would balloon each render. The download route
    // asks for `data` explicitly, which overrides this.
    omit: { upload: { data: true } },
  });
}

// Next.js hot-reloads modules in development, which would otherwise open a new
// database connection on every edit until SQLite runs out of handles. The type
// comes from the factory so it carries the global `omit` above.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
