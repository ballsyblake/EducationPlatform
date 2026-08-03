# Coach LMS — production image.
#
# Runs the Next.js server, applies migrations on boot, and keeps the SQLite
# database plus uploaded files on a mounted disk at /data. Works as-is on
# Render, Railway, Fly.io, or any host that can run a container with a volume.

# ---------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 falls back to compiling from source when no prebuilt binary
# matches the platform, so keep a toolchain available for the install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------- build
FROM deps AS builder
WORKDIR /app

COPY . .
# `npm run build` runs `prisma generate` first, emitting ./generated/prisma.
RUN npm run build

# --------------------------------------------------------------------- runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATA_DIR=/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# node_modules comes from the build stage so the runner needs no toolchain and
# any compiled native bindings carry over intact.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/package.json /app/package-lock.json /app/next.config.ts /app/prisma.config.ts ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Runtime state lives here; mount a persistent disk at this path.
#
# The container stays root on purpose. Hosts mount their volumes with their own
# ownership, and a non-root user frequently can't write to a freshly attached
# disk — which would fail the very first boot. Dropping privileges is possible
# but needs the disk chowned first; see the deployment notes in the README.
RUN mkdir -p /data/uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
