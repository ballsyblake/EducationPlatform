# Working on this repository

Two products for association football in Queensland, in one deployment:

- **Coach Education** at `/dashboard` — an LMS plus AFC/FA diploma delivery
- **Club Development & Assessment** at `/cda` — the annual club rating and shield

They share one account system, one database and one deploy, and nothing else.

`README.md` is thorough and current. **Read it before asking about anything it
covers** — the rubrics, the scoring model, the deployment, the roles. This file
is the part that isn't in the README: what to watch out for, and where things
live.

---

## Traps

Every one of these cost somebody an afternoon. They are not hypothetical.

1. **Prisma 7's `PrismaConfig` has no `adapter` field.** `prisma migrate deploy`
   cannot talk to a `libsql://` URL. Migrations run through `scripts/migrate.ts`,
   which is what `npm run db:deploy` and the container entrypoint call.
2. **`prisma migrate dev` is interactive** and fails in a non-TTY. To add a
   migration: edit `prisma/schema.prisma`, then
   `npx prisma migrate diff --from-migrations prisma/migrations --to-schema
   prisma/schema.prisma --script`, write the output into a hand-made
   `prisma/migrations/<timestamp>_<name>/migration.sql` with a comment block
   explaining *why*, then `npx prisma migrate deploy && npx prisma generate`.
3. **`cookies().set()` throws in a Server Component.** Sliding session expiry
   lives in the database, not in a re-set cookie. See `src/lib/auth.ts`.
4. **Never build a redirect URL from `request.url`.** Send a relative
   `Location`. The proxy in front of the app makes `request.url` a lie.
5. **React 19 resets uncontrolled forms after an action settles.** Anywhere a
   validation error must not wipe what somebody typed, the inputs are
   controlled. Look at any `useActionState` form here for the pattern.
6. **Use `||`, not `??`, for env fallbacks.** An empty string is unset.
7. **Never return a sign-in link to the browser in production.**
   `canRevealMagicLink()` gates it; `magicLinkAvailable()` decides whether the
   login form is even offered.
8. **Tailwind v4 `@apply` cannot compose your own component classes.** `@apply
   btn-primary` silently does nothing. Repeat the utilities.
9. **A client-level Prisma `omit` keeps file blobs out of list queries.** Don't
   remove it and don't select `Upload.data` in a list.
10. **Nothing slow before the port opens.** The CDA season import once ran
    inside boot, took fourteen minutes against the hosted database, and the host
    killed the deploy after five. Long work runs *beside* the server from
    `docker-entrypoint.sh`, never in front of it.
11. **`npm run lint` is broken repo-wide** and was before any of this work:
    `next lint` was removed in Next 16 and the script tries to lint a directory
    called `lint`. Use `npm run typecheck`. Don't "fix" it as a side quest.

## Handling the data

- **`prisma/data/fq-2026.json` is real Football Queensland data** — 48 real
  clubs, 52 named ambassadors with real email addresses, ~2,900 assessment
  scores. Do not paste it into a reply, publish it, or send it anywhere
  external.
- **`prisma/data/b-diploma-2026.json` holds 87 real coaches' assessment
  history.** Names are real; email addresses are anonymised to
  `first.last@example.com` by the extractor, deliberately.
- **Neither import runs at boot.** Each is armed by an environment variable
  (`FQ_IMPORT_2026`, `B_DIPLOMA_IMPORT_2026`) for one boot, and a row in `Meta`
  stops it running twice. Loading real people's records is a decision somebody
  takes on purpose.

## How work gets verified here

Compiling is not verifying. **Run the app and drive it in a real browser**
before saying something works:

```bash
npm run dev            # then Playwright against /opt/pw-browsers/chromium
npm run typecheck
npm run build
```

Chromium is preinstalled at `/opt/pw-browsers/chromium` — pass it as
`executablePath`; do not run `playwright install`. Sign-in in dev prints a magic
link to the server log and renders it on the login page, so a test can sign in
as anybody.

Say plainly what was verified and what wasn't. Flag real problems even when they
weren't asked about, but finish the task rather than stopping on them.

---

## The seams

Three areas. Most changes touch exactly one. **A chat working on one should not
open the others.**

### Coach Education — `src/app/(app)/`
Courses, coursework, grading, the attendance register, hours and make-ups,
post-course support, the coaches list.
Libraries: `src/lib/{coursework,grading,support,support-rubric,attendance,coaches}.ts`
Data: `scripts/{extract-b-diploma-2026.py,import-b-diploma.ts,import-courses.ts}`
See `src/app/(app)/CLAUDE.md`.

### Club Development — `src/app/(cda)/`
The cycle, clubs, pools, assessors, scoring, reconciliation, the shield.
Libraries: `src/lib/cda/`, components in `src/components/cda/`
Data: `scripts/{extract-fq-2026.py,import-fq-2026.ts,import-season.ts,seed-cda.ts,reset-cda.ts}`
See `src/app/(cda)/CLAUDE.md`.

### The spine — shared by both
```
prisma/schema.prisma        One schema, one migration history
src/lib/auth.ts             Sign-in links, sliding sessions, role guards
src/lib/access.ts           Course and upload authorization
src/lib/db.ts               The client (note the `omit`)
src/lib/adapter.ts          Picks SQLite or Turso from DATABASE_URL
src/lib/uploads.ts          File validation and database-backed storage
src/lib/format.ts           displayName, dates, initials
src/components/ui.tsx       Badge, PageHeader, StatTile, EmptyState, ProgressBar
src/app/(app)/layout.tsx    The coach-education shell and its navigation
docker-entrypoint.sh        Boot order — migrate, bootstrap, seed, then serve
render.yaml                 The deploy, and every env var that arms something
scripts/boot.ts             What runs before the port opens
scripts/bootstrap-admin.ts  ADMIN_EMAILS, and ADMIN_LINK when locked out
```

Only ~2,100 lines. A chat that needs it can read all of it.

## Roles

`COACH` and `EDUCATOR` belong to Coach Education. `CLUB` and `ASSESSOR` belong
to the CDA portal. `ADMIN` runs Coach Education and may *additionally* hold
`User.cdu`, which is what grants the Club Development Unit.

**`cdu` is a grant, not a consequence of being an admin.** It used to be
`role === "ADMIN"`, which meant promoting an educator handed them every club's
assessment. Don't put that back.

`requireStaff()` gets an actor through the door; `assertCourseStaff(user,
courseId)` gets them into the room. Every action that writes a mark, a grade, a
rating or a support case calls **both** — being staff somewhere is not being
staff *here*. See the table in `README.md` under "Who can do what".

## Working in parallel with other chats

- **One chat, one PR-sized change**, then start a new chat. The repository is
  the memory — this file, the README, and commit messages that say *why*. A
  transcript is not.
- **A branch per chat.** Never push to the default branch.
- **Only one chat touches `prisma/schema.prisma` at a time.** Two chats
  generating migrations from different baselines produce a chain that will not
  apply. Everything else merges.
- Open a chat by naming its fence: *"Coach Education only — don't touch `(cda)`
  or the schema."*

## Conventions

- Comments explain **why**, not what. If a line looks odd, the comment says what
  went wrong the other way. Match that density; don't narrate the obvious.
- Commit messages are prose and explain the reasoning. The diff shows what
  changed.
- 404 rather than 403 anywhere the response would confirm that something exists
  to somebody with no business knowing it.
- Nothing is decided automatically that a person should decide. Hours become a
  debt when an educator says so; a coach is referred to support by a
  conversation, not by a rating.
