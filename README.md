# Coach LMS

A Canvas-style learning platform, cut down to what a football coaching staff
actually needs. Coordinators post install work; coaches complete assignments,
take quizzes, and get feedback. Sign-in is passwordless — there are no passwords
anywhere in the system — and running it needs no email server. See
[Signing in](#signing-in).

## What it does

**For coaches**

- A dashboard of everything assigned, sorted by due date, with overdue items flagged
- Course pages with a library of playbooks, install docs, and film (uploaded files or YouTube/Vimeo links)
- Assignments accepting a written response, file attachments, or both — with drafts you can save and come back to
- Quizzes with multiple-choice, true/false, and written questions
- A Grades & Feedback page collecting every score and written comment in one place

**For admins (coordinators / head coach)**

- Create courses, enroll staff, and publish or hide coursework
- Author assignments and build quizzes question by question
- A grading queue: score submissions, review written quiz answers, add feedback, or send work back for revision
- A staff progress dashboard — completion, overdue counts, and averages per coach, filterable by course
- Staff management: add coaches by email, hand out sign-in links, promote to admin, deactivate

**Grading model.** Multiple-choice and true/false questions score the instant a
coach submits. Written answers can't be auto-graded, so an attempt containing
one lands in the grading queue as `AWAITING_REVIEW` until a coordinator reads it
and awards points. Assignment submissions are always graded by a human.

## Stack

Next.js 16 (App Router, server actions) · React 19 · Prisma 7 on SQLite ·
Tailwind CSS v4 · Nodemailer

## Getting started

```bash
npm install
cp .env.example .env       # adjust ADMIN_EMAILS to your own address
npm run db:migrate         # create the SQLite database
npm run db:seed            # load a sample coaching staff and two courses
npm run dev
```

Open http://localhost:3000/login and enter any seeded address. In development
the sign-in link appears on the page, so you can click straight through:

| Email                       | Role                            |
| --------------------------- | ------------------------------- |
| `head.coach@example.com`    | Admin — courses and grading     |
| `marcus.webb@example.com`   | Coach — Defensive Coordinator   |
| `tj.rollins@example.com`    | Coach — Offensive Coordinator   |
| `dana.pryor@example.com`    | Coach — Linebackers             |

## Signing in

Nobody has a password. A coach signs in by opening a link, and the session then
slides forward on every visit — so anyone using the app regularly never has to
sign in again. Only a genuinely dormant account lapses (60 days idle by
default).

**Links handed out by an admin — no email server needed.** Adding a coach on
`/admin/people` produces a sign-in link right there: copy it, text it, or hold
up the QR code for them to scan off your screen. `Get sign-in link` does the
same for anyone already on staff who needs a new one. This is the default path
and the one to use if you're working from a registration list.

**Links by email.** If SMTP is configured, coaches can also request their own
link from the login page. Without SMTP that form is hidden entirely rather than
silently failing — a link nobody receives is worse than no button.

Either way, accounts are only ever created by an admin — signing in never
creates one. Links are single-use: opening one retires it, and issuing a new
link kills the previous one. Emailed links last 20 minutes; admin-issued ones
last 7 days, since they have to survive the trip from your screen to a coach's
phone. Both are configurable (`EMAIL_LINK_TTL_MINUTES`, `INVITE_LINK_TTL_DAYS`,
`SESSION_IDLE_DAYS`).

Deactivating a coach drops their sessions *and* kills any link already handed
out. Coaches can review their signed-in devices on `/account` and sign the
others out.

### Sending real email

Optional. Set the SMTP variables in `.env`:

```
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_USER="resend"
SMTP_PASSWORD="…"
MAIL_FROM="Coach LMS <lms@yourprogram.com>"
APP_URL="https://lms.yourprogram.com"
```

`APP_URL` must be set correctly in production — it's the base of every magic
link that goes out.

Free options exist if you want email without a bill: a Gmail app password works
over SMTP, as does Brevo's free tier. Neither is required.

## Security notes

Requesting a link for an address that isn't on staff returns the same
"check your email" response as a real one, so the login form can't be used to
work out who is on the staff list.

Sign-in links are **never** shown in the browser when `NODE_ENV=production`.
Without SMTP the app still logs them, but returning one to the login page would
let anyone sign in as any coach just by typing their address. Links shown on the
staff page are different: the admin viewing them is already authenticated and
authorised.

Only token hashes are stored, for both sign-in links and sessions — a database
dump yields nothing that can be replayed. Repeated requests for the same
address are throttled so nobody's inbox can be flooded.

A sign-in link is a bearer credential for as long as it's unused: anyone holding
it can sign in as that coach. That's the trade-off passwordless makes, and why
admin-issued links are single-use and time-boxed. Send them over a channel you'd
trust with the account itself.

Uploaded files are never served statically. They're written to `uploads/` under
a random name and streamed through `/api/files/[id]`, which checks on every
request that the requester is an admin, is enrolled in the course the material
belongs to, or is the author of the submission the file is attached to.

## Deploying

The app needs a running Node process, a database, and a disk — so a static host
like GitHub Pages can't serve it. Anything that runs a container with a
persistent volume works; the repo ships config for Render and Railway.

### Doing this for free

The catch is the disk, not the server. Free tiers on Render, Vercel, and
Railway all have an ephemeral filesystem, which would erase the database and
every uploaded file on each deploy. Fly.io removed its free allowance
entirely. Two ways around it:

**Self-host.** Run the container on any machine that stays on — a computer at
the facility, or a spare box — and put a free [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
in front of it for a public HTTPS URL. Zero code changes, zero cost, no size
limits on film. This is the simplest genuinely free option.

**Free cloud database instead of a disk.** Keep a free web host and move state
off the filesystem: [Turso](https://turso.tech/pricing) is SQLite-compatible,
free for 5 GB, allows commercial use, and needs no card — so the schema and
migrations here carry over nearly unchanged. Uploads then need somewhere to go
too (object storage, or the database with a size cap), and film is better
pointed at YouTube/Vimeo links, which the library already supports. That
rework isn't in the repo yet.

Note that Vercel's free Hobby plan is [non-commercial
only](https://vercel.com/docs/plans/hobby), so it's only an option if the
program isn't revenue-generating.

Everything lives on one mounted disk at `/data`:

```
/data/coach-lms.db     SQLite database
/data/uploads/         Playbooks, film, and submission attachments
```

`docker-entrypoint.sh` runs on every boot and is safe to re-run: it creates the
directories, applies any pending migrations with `prisma migrate deploy` (which
never drops data), makes sure everyone in `ADMIN_EMAILS` can sign in, and starts
the server.

### Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. It reads `render.yaml`.
3. Fill in the prompted env vars — at minimum `APP_URL` and `ADMIN_EMAILS`.
4. Deploy, then sign in at `https://<your-app>.onrender.com/login`.

A persistent disk requires a paid instance type. On the free tier the
filesystem is wiped on every deploy, which would erase the database and every
uploaded file, so the blueprint specifies `starter`.

### Railway

1. **New Project → Deploy from GitHub repo**. Railway detects the `Dockerfile`.
2. Add a **Volume** mounted at `/data`.
3. Set the env vars below under **Variables**.
4. Generate a domain, and set `APP_URL` to it.

### Environment variables

| Variable        | Required | What it does                                                        |
| --------------- | -------- | ------------------------------------------------------------------- |
| `APP_URL`       | Yes      | Public base URL. Every magic link is built from it                   |
| `ADMIN_EMAILS`  | Yes      | Comma-separated admins, granted access on boot                       |
| `SMTP_HOST`     | No       | Only needed if coaches request their own links                       |
| `SMTP_PORT`     | –        | Defaults to 587                                                      |
| `SMTP_USER`     | –        | SMTP username                                                        |
| `SMTP_PASSWORD` | –        | SMTP password                                                        |
| `MAIL_FROM`     | –        | From address, e.g. `Coach LMS <lms@yourprogram.com>`                  |
| `DATA_DIR`      | –        | Disk mount point. Defaults to `/data`                                |
| `DATABASE_URL`  | –        | Derived from `DATA_DIR` unless set explicitly                        |
| `UPLOAD_DIR`    | –        | Derived from `DATA_DIR` unless set explicitly                        |

Set `APP_URL` correctly before inviting anyone. It's the base of every sign-in
link that goes out, and a wrong value produces links that point elsewhere.

SMTP is optional. Without it, the login form is hidden and you hand out sign-in
links from the staff page — see [Signing in](#signing-in). On a brand-new
deploy the first admin's sign-in link is printed to the boot logs, so open the
host's log viewer after the first deploy. A later deploy prints a fresh link
whenever an admin has no active session, so a lost link is never a lockout.

### Running the image locally

```bash
docker build -t coach-lms .
docker run --rm -p 3000:3000 \
  -v coach-lms-data:/data \
  -e APP_URL="http://localhost:3000" \
  -e ADMIN_EMAILS="you@yourprogram.com" \
  coach-lms
```

`/api/health` returns 200 with a database round-trip, and is what the host's
health check watches.

### Notes

The container runs as root so it can write to a freshly attached volume,
whatever ownership the host gives it. To drop privileges, chown the disk to a
non-root user in the entrypoint before the server starts and add `USER` to the
Dockerfile — worth doing if the disk is shared.

The runtime image carries the full `node_modules` from the build stage, which
keeps native bindings intact at the cost of some image size. Adding
`npm prune --omit=dev` after the build step trims it if that matters.

## Scripts

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start the dev server                               |
| `npm run build`      | Generate the Prisma client and build for production |
| `npm run typecheck`  | `tsc --noEmit`                                      |
| `npm run db:migrate` | Create and apply a migration                       |
| `npm run db:seed`    | Reset seeded data and reload the sample program    |
| `npm run db:reset`   | Drop the database, re-migrate, and re-seed         |
| `npm run db:studio`  | Browse the database in Prisma Studio               |
| `npm run bootstrap:admin` | Grant admin access to `ADMIN_EMAILS` and print a sign-in link |

`prisma`, `tsx`, and `dotenv` are runtime dependencies rather than dev ones
because the container runs migrations and the admin bootstrap on boot.

## Moving off SQLite

SQLite keeps local setup to zero, but nothing in the app depends on it. To move
to Postgres, change the `datasource` provider in `prisma/schema.prisma`, swap
`@prisma/adapter-better-sqlite3` for `@prisma/adapter-pg` in `src/lib/db.ts`,
point `DATABASE_URL` at the new server, and re-run the migrations. The one
SQLite-specific workaround is in `enrollAllCoaches`, which filters duplicates in
application code because SQLite has no `skipDuplicates`.

Uploads are on local disk, so a multi-instance deployment needs object storage
(S3 or similar) behind `src/lib/uploads.ts`.

## Layout

```
prisma/
  schema.prisma        Data model
  seed.ts              Sample coaching staff, courses, and graded history
src/
  app/
    login/             Sign-in link request
    auth/verify/       Token consumption → session
    (app)/             Everything behind authentication
      account/         Your details and signed-in devices
      dashboard/       Coach home
      courses/         Course list, detail, and library
      assignments/     Instructions, submission, feedback
      quizzes/         Taking a quiz and reading results
      grades/          Score and feedback history
      admin/           Courses, quiz builder, grading queue, progress, staff
    api/files/[id]/    Authorization-checked file streaming
  lib/
    auth.ts            Sign-in links, sliding sessions, role guards
    access.ts          Course and upload authorization
    grading.ts         Auto-grading and score rollups
    coursework.ts      Task aggregation and progress summaries
    uploads.ts         File validation and storage
```
