#!/bin/sh
# Container start-up: get the database into a usable state, then serve.
set -e

# Two supported shapes:
#   1. Hosted database (Turso): set DATABASE_URL=libsql://… and TURSO_AUTH_TOKEN.
#      Nothing is written to disk, so any free host works.
#   2. Local SQLite file: leave DATABASE_URL unset and mount a disk at DATA_DIR.
case "${DATABASE_URL}" in
  libsql:*|https:*|wss:*)
    echo "[boot] database: hosted (${DATABASE_URL%%\?*})"
    ;;
  "")
    DATA_DIR="${DATA_DIR:-/data}"
    export DATABASE_URL="file:${DATA_DIR}/coach-lms.db"
    mkdir -p "${DATA_DIR}"
    echo "[boot] database: local file at ${DATA_DIR} (mount a disk here)"
    ;;
  *)
    echo "[boot] database: ${DATABASE_URL}"
    ;;
esac

# Applies any migrations this image ships that the database hasn't seen yet.
# Only ever moves forward — nothing is reset or dropped — so it's safe on every
# boot. Not `prisma migrate deploy`: that can't talk to a hosted libSQL URL.
echo "[boot] applying migrations…"
npx tsx scripts/migrate.ts

# Makes sure ADMIN_EMAILS can always sign in. Prints a link when they can't.
echo "[boot] checking admin accounts…"
npx tsx scripts/bootstrap-admin.ts

echo "[boot] starting server on port ${PORT:-3000}"
exec npx next start --port "${PORT:-3000}" --hostname 0.0.0.0
