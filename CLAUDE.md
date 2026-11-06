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
   **Controlling a radio is not enough.** React writes a `value` back after the
   reset, but not a `checked`: the DOM clears, React still believes the box is
   ticked, and re-rendering changes nothing. A refused save took all six scores
   off the delivery assessment while the state behind them was intact. Remount
   the group when the action settles — `key` on the fieldset, bumped on each
   settle — which writes `checked` into fresh nodes. See
   `educator/grading/[enrollmentId]/assessment-form.tsx`.
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
11. **Never run `npm audit fix --force` here.** Its "fix" for the two advisories
    under the Prisma CLI is `prisma@6.19.3` — a major *downgrade* that would
    take the schema back behind every migration in `prisma/migrations`. The
    `overrides` block in `package.json` patches `mysql2` and `deepmerge-ts` in
    place instead, which is what makes `npm audit` come back clean. Don't
    delete it; re-check it when Prisma's own dependencies move.
12. **`npm run lint` is broken repo-wide** and was before any of this work:
    `next lint` was removed in Next 16 and the script tries to lint a directory
    called `lint`. Use `npm run typecheck`. Don't "fix" it as a side quest.
13. **Next expands `$NAME` inside `.env` values.** The admin password hash is
    `.`-separated, not `$`-separated like every other scrypt/PHC string you have
    seen, because base64url contains `_` and a key beginning with a letter made
    the tail of the hash a variable reference that Next replaced with nothing.
    The hash still parsed, had an empty key, and refused the correct password in
    two milliseconds. Don't put a `$` in anything that travels through an
    environment variable here. See `src/lib/password.ts`.
14. **A `"use server"` file may only export async functions.** Exporting an
    initial-state object next to the actions it belongs with fails at module
    evaluation with *"found object"* and takes the whole page down, not just the
    form. Initial states live in the client component. See
    `src/app/login/login-form.tsx`.

## Handling the data

- **`prisma/data/fq-2026.json` is real Football Queensland data** — 48 real
  clubs, 52 named ambassadors with real email addresses, ~2,900 assessment
  scores. Do not paste it into a reply, publish it, or send it anywhere
  external.
- **The coach database workbook is 1,676 real coaches** with live addresses and
  FA numbers, and one of its tabs is a Squadi member export carrying home
  addresses, Working With Children Check numbers and minors. Don't commit it,
  don't paste it into a reply, and don't read the Squadi tab — see
  `src/lib/coach-db-file.ts`. It is loaded through `/admin/coach-db` after a
  deploy; there is deliberately no script and nothing at boot.
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
post-course support, session footage and its feedback notes, the coaches list,
the coach register.
Libraries: `src/lib/{coursework,grading,support,support-rubric,attendance,coaches,footage}.ts`
Coach register: `src/lib/{coach-db-file,coach-db,coach-db-schema,coach-register}.ts`
Register exports: `src/lib/{zip,xlsx,register-file,register-schema,assessment-plan-parts,assessment-plan-docx,b-diploma-docx,b-diploma-rubric,fa-rubric-appendix}.ts`
Data: `scripts/{extract-b-diploma-2026.py,import-b-diploma.ts,import-courses.ts}`
One-off: `npm run assessment:score` — a C Diploma form with the six-area scores
filled in, which no register carries. FQ settle them by email after a course
closes, so they are typed in as an argument and nothing in the app passes them.
`assessmentPlanDocx` takes the same argument for the B: the level ticked per
area, the CET's evidence beside it, the strengths and gaps bullets, and an
outcome box to tick where the register is behind the CETs. All of it is typed
into Word after the export, so a form rebuilt from the register loses it
unless it is handed back in.
See `src/app/(app)/CLAUDE.md`.

**The coach assessment outcome sheet exists twice.** `src/components/outcome-sheet.tsx`
renders it in HTML — the coach profile at `/admin/coaches/<enrollmentId>`, and
the print pages at `/outcome/<enrollmentId>` and `/outcome/course/<id>`.
`src/lib/outcome-docx.ts` renders the same sheet as a Word file behind the
Export to Word button, because FQ circulates .docx that other people edit and
sign. Both read the same `OutcomeSheet` from `src/lib/outcome.ts`, so they
cannot disagree about *what* is on a record — but each owns its own layout, and
those **will** drift. When a field moves, move it in both.

**The coach register and the coaches list are two different lists.**
`/admin/coaches` is a row per *enrolment* — where somebody stands on a course.
`/admin/coach-db` is a row per *person* — every coach FQ holds a qualification
for, which on the real data is 1,648 people who have never been on a cohort
here. They were briefly the same page, badly: before `coachRecord: null` went
into `getCoachRoster`'s unenrolled query, importing the register put sixteen
hundred rows reading "Not enrolled" onto the coaches list and took it from
600 ms to six seconds. If you add a coach-shaped list, decide which of the two
questions it answers first.

Four things about the importer that look like bugs and are not:

- **It never blanks a field.** `recordFields` coalesces every optional value to
  `undefined`, because `null` would clear the column. The source is a hand-kept
  spreadsheet with 625 missing regions, and an import that wrote those holes
  would delete somebody's work on every re-run. Don't "simplify" the `??
  undefined`s away.
- **It never writes a rating down to nothing**, which is the specific fault the
  whole table exists to fix: the spreadsheet's VLOOKUP let a "No rating" cell
  sit on top of a real judgement, and 336 ratings were behind one.
- **It does not read the `Squadi` sheet.** That tab is 7,476 people with home
  addresses, 6,021 Working With Children Check numbers, guardian contacts and
  165 minors. It is in the workbook because 47 club names were VLOOKUPed out of
  it. Adding it would be a child-safeguarding dataset in this database to save
  47 cells.
- **Writes are chunked, not per row.** Row-at-a-time was four round trips per
  coach — nearly seven thousand against a hosted database, inside a server
  action somebody is watching. `createMany` over chunks of two hundred took the
  same import from 14.3s to 683ms locally.

`CoachQualification` is a cache of FALC and is replaced wholesale on every
import. That is only safe because nothing of FQ's own is stored on it; if you
ever add a field somebody types, it stops being a cache and the delete-and-
rewrite has to go.

**A register is read in the app, and never imported by it.** `/admin/registers`
takes an `.xlsx` register, parses it (`src/lib/register-file.ts`, on a zip and
xlsx reader written here rather than a dependency), says who needs an action
plan and who passed, and hands back a zip of Word files. It writes **nothing**
to the database — loading real coaches' records is still `npm run courses:import`
and still a decision somebody takes on purpose.

Two things to know before changing it. The register is uploaded once and travels
back to the download route as the JSON it parsed to, because one of these files
is 52MB of embedded photographs; the route re-validates it against
`register-schema.ts`, and that schema is tied to `ParsedRegister` by a pair of
assignments at the foot of the file, so adding a field to one and not the other
stops compiling. And **no 2026 register carries a six-area rubric score** — the
only number per delivery is a free-text `Session Rating: n` on the 1-5 scale —
so the generated document's rubric table and its total out of eighteen come out
blank for the CETs to tick. Don't "fix" that by deriving one from the other; see
the note at the head of `delivery-rubric.ts`.

**The two registers label the per-delivery rating differently.** The B's
write-ups say `Session Rating:` and the C's say plain `Rating:`. Until that was
noticed every one of the C register's seventy-nine deliveries came out unrated,
with the label swept into the action plan above it as a fourth step —
`Rating: N/A` printed on the form under three real recommendations — and
thirty-nine untouched template cells counted as deliveries because that step
made them look filled in. `FIELDS` in `register-file.ts` carries both
spellings, longest first, and normalises them to one key.

**The register does carry a per-delivery level, as a cell colour.** The
Assessment sheet shades each write-up with Excel's Bad / Neutral / Good style,
which is NYC / C / HC, and that is the only place that judgement exists — there
is no column for it. `xlsx.ts` reads cell fills for this, `levelFromFill` in
`register-file.ts` turns one into a level *by hue* rather than by matching hex
(assessors reach for the colour picker, so there are six fills in use across
two registers, not three), and `RegisterDelivery.level` carries it. **All
three documents colour their delivery columns from it, and none of them print
the 1-5 rating** — the colour and the number say the same thing about a
session and the colour is the one the CET set, so the number is dropped and
the shading kept. An unshaded cell is null and the heading falls back to the
neutral grey, never to the template's salmon, which means Not Yet Competent on
the same page. The level is still not inferred from the rating, which would be
the same invented conversion as above.

**The two diplomas have different paperwork, and so does the export.** FQ run
the B and the C off different forms, so there are three generated documents,
not one:

```
assessment-plan-parts.ts   What all three share: the candidate block, the
                           delivery write-ups, the palette, the cell helpers,
                           the sign-off
assessment-plan-docx.ts    The C Diploma form, and the dispatch
b-diploma-docx.ts          The B Diploma's two: the formative assessment /
                           action plan, and the post-course feedback letter
```

The C form scores six areas 0-3 and totals them out of eighteen. The B form
ticks NYC / C / HC per area and **totals nothing**, carries its own rubric
(`b-diploma-rubric.ts`, three levels, not FA's four with a column removed).
The two B documents even have different titles from each other. Both end on
that rubric: there was briefly a Coach Development Plan page after it, with
the coach's photograph read off the register's in-cell images, and FQ do not
send one — the page, the photographs and the rich-value reader that found them
all went together on 2026-11-06, and are in the history if wanted back.
Don't collapse them: `isBDiploma(register)` picks the layout, `kind` picks which
of the B pair, and a change to one form is a change to one form.

The Word furniture — the logo, the maroon, the typeface, the cell padding — is
in `src/lib/fq-docx.ts`, shared by the outcome sheet and the assessment forms.
Brand changes go there once. It holds **two** header/footer pairs, which is
deliberate: FQ's two assessment documents look different, the outcome sheet
maroon-banded with the mark on the left and the assessment forms plain with the
document's name on the left. Each form is laid out to match FQ's own file
closely — the palette, the column widths in twips and the 11pt body are all
transcribed from them, because the first version was built in the app's visual
language and read as a different document, which on paperwork a coach signs is
a difference that matters. Keep them matching those files rather than the rest
of the app.

Two Word layout facts cost a round each here, so: a table's `insideHorizontal`
and `insideVertical` borders are **drawn when left unset** — use
`NO_TABLE_BORDERS` for a table and `NO_BORDERS` only for a cell — and **never
nest a table inside a cell for layout**, because it is laid out in the cell's
content area (inset by the padding) and Word appends its own paragraph
underneath, since a cell may not end on a table.

There was briefly a third, `scripts/export-assessment-docx.py`, which built the
Word file from the extractors' JSON so it ran on a register nobody had
imported. It went when the route arrived: three copies of one layout is two too
many, and the register path is import-then-export. It is in the history if that
path is ever wanted back.

### Club Development — `src/app/(cda)/`
The cycle, clubs, pools, assessors, scoring, reconciliation, the shield.
Libraries: `src/lib/cda/`, components in `src/components/cda/`
Data: `scripts/{extract-fq-2026.py,import-fq-2026.ts,import-season.ts,seed-cda.ts,reset-cda.ts}`
See `src/app/(cda)/CLAUDE.md`.

### The spine — shared by both
```
prisma/schema.prisma        One schema, one migration history
src/lib/auth.ts             Sign-in links, the admin password, sessions, guards
src/lib/password.ts         scrypt hashing — shared with scripts/, so not server-only
src/lib/login-throttle.ts   In-memory attempt limiting for the admin password
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
scripts/admin-password.ts   Generates ADMIN_PASSWORD_HASH from stdin
```

Only ~2,100 lines. A chat that needs it can read all of it.

## Roles

`COACH` and `EDUCATOR` belong to Coach Education. `CLUB` and `ASSESSOR` belong
to the CDA portal. `ADMIN` runs Coach Education and may *additionally* hold
`User.cdu`, which is what grants the Club Development Unit.

**The coach portal is parked.** A `COACH` cannot sign in — `canSignIn()` in
`auth.ts` is the only place that decides it, and the sign-in form, a link
already issued and a session already in the jar all go through it. Nothing was
deleted: the accounts, the records and the coach-facing pages are all still
there, and `COACH_PORTAL=on` brings them back. So Coach Education has two roles
that sign in, the assessor and the admin, and the assessor's whole view is the
one list at `/educator`.

**An admin signs in with a password, everyone else with a link.**
`ADMIN_PASSWORD_HASH` is one scrypt hash shared by every `ADMIN_EMAILS`
address — a breakglass credential for whoever owns the deploy, not a password
system. It replaced `ADMIN_LINK=print`, which wrote a live sign-in token into
the deploy log on every boot. Don't put that back, and don't widen the password
beyond `ADMIN_EMAILS`: if admins ever need passwords of their own they belong on
`User`, hashed per account.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
