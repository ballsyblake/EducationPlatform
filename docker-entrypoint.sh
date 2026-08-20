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

# One process for the three things that have to happen before we serve:
#
#   1. Apply any migrations this image ships that the database hasn't seen.
#      Only ever moves forward — nothing is reset or dropped. Not
#      `prisma migrate deploy`: that can't talk to a hosted libSQL URL.
#   2. Make sure ADMIN_EMAILS can always sign in, printing a link when they
#      can't.
#   3. Bring the CDA rubric catalogue up to what this image ships. Additive
#      only, so wording the Club Development Unit has edited is never
#      overwritten, and skipped in a single query when the catalogue hasn't
#      changed since the last boot.
#
# Three separate `npx tsx` calls used to do this, which meant three Node starts,
# three TypeScript transpiles and three connections to the database before the
# server began listening. On a host that sleeps idle instances, that whole cost
# lands on whoever opens the site next.
#
# `./node_modules/.bin/…` rather than `npx`, which spends a few hundred
# milliseconds resolving a package that is already right there.
echo "[boot] preparing the database…"
./node_modules/.bin/tsx scripts/boot.ts

# Football Queensland's season, when FQ_IMPORT_2026 is set — in the background,
# because it must not hold up the port opening.
#
# It ran inside boot once. Against the hosted database the import took over
# fourteen minutes, the host stopped scanning for an open port after five, and
# the deploy was killed with the season half-loaded. Nothing about the import is
# a prerequisite for serving, so it no longer behaves like one: started here,
# left running as a child of the server process below, and writing its own
# progress to the same logs.
#
# `&` before `exec`: the exec replaces this shell with the server, and the
# already-started child carries on regardless.
if [ -n "${FQ_IMPORT_2026}" ]; then
  ./node_modules/.bin/tsx scripts/import-season.ts &
fi

echo "[boot] starting server on port ${PORT:-3000}"
exec ./node_modules/.bin/next start --port "${PORT:-3000}" --hostname 0.0.0.0
