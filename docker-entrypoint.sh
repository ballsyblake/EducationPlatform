#!/bin/sh
# Container start-up: get the persistent disk into a usable state, then serve.
set -e

DATA_DIR="${DATA_DIR:-/data}"
export DATABASE_URL="${DATABASE_URL:-file:${DATA_DIR}/coach-lms.db}"
export UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"

echo "[boot] database: ${DATABASE_URL}"
echo "[boot] uploads:  ${UPLOAD_DIR}"

# The mounted disk starts empty on a brand-new service.
mkdir -p "${DATA_DIR}" "${UPLOAD_DIR}"

# Applies any migrations this image ships that the disk hasn't seen yet.
# `migrate deploy` never resets or drops data, so it's safe on every boot.
echo "[boot] applying migrations…"
npx prisma migrate deploy

# Makes sure ADMIN_EMAILS can always sign in. No-op once they exist.
echo "[boot] checking admin accounts…"
npx tsx scripts/bootstrap-admin.ts

echo "[boot] starting server on port ${PORT:-3000}"
exec npx next start --port "${PORT:-3000}" --hostname 0.0.0.0
