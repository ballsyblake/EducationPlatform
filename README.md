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

Next.js 16 (App Router, server actions) · React 19 · Prisma 7 on SQLite or
[Turso](https://turso.tech) · Tailwind CSS v4 · Nodemailer

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

Uploaded files are never served statically. They're stored in the database and
streamed through `/api/files/[id]`, which checks on every request that the
requester is an admin, is enrolled in the course the material belongs to, or is
the author of the submission the file is attached to. Authorization runs against
the metadata first, so an unauthorized request never pulls file contents out of
the database.

## Deploying

The app needs a running Node process and a database — so a static host like
GitHub Pages can't serve it. It does *not* need a disk, which means free
container hosts work. The repo ships config for Render and Railway.

### Free hosting, with no disk

Free tiers on Render, Vercel, and Railway all have an ephemeral filesystem —
anything written to disk is erased on every deploy. Rather than pay for a disk,
this app keeps **all** of its state in the database, including uploaded files,
which are stored as rows. That means it runs on a free host unmodified.

The database is [Turso](https://turso.tech/pricing): SQLite-compatible, free for
5 GB, commercial use allowed, no credit card. Because it speaks the same SQL,
the schema and every migration here are identical to the local SQLite setup —
only the connection string changes.

**The trade-off is file size.** Every upload travels over the database
connection, so `MAX_UPLOAD_MB` defaults to 10 and oversized files are rejected
with a message pointing at the alternative. Playbook PDFs, install docs, and
images are all comfortably under that. Film should go in as a **video link** —
the library already plays YouTube and Vimeo inline, which is both free and
better than hosting video yourself.

Self-hosting still works exactly as before: leave `DATABASE_URL` unset, mount a
disk at `DATA_DIR`, and the entrypoint uses a local SQLite file. You can raise
`MAX_UPLOAD_MB` there since nothing is going over a network.

### Render (free) + Turso

**1. Create the database.**

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create coach-lms
turso db show coach-lms --url        # → libsql://coach-lms-<org>.turso.io
turso db tokens create coach-lms     # → the auth token
```

**2. Deploy the app.** Push this repo to GitHub, then in Render choose
**New → Blueprint** and select it. `render.yaml` sets up a free Docker service
with no disk. Fill in the prompted variables:

| Variable           | Value                                       |
| ------------------ | ------------------------------------------- |
| `DATABASE_URL`     | the `libsql://…` URL from step 1             |
| `TURSO_AUTH_TOKEN` | the token from step 1                        |
| `APP_URL`          | `https://<your-app>.onrender.com`            |
| `ADMIN_EMAILS`     | your own email address                       |

**3. Sign in.** The first boot applies the migrations, creates your admin
account, and prints a sign-in link to the deploy logs. Open Render's log viewer,
click the link, and add your staff from the Staff page.

`APP_URL` has to be right before you invite anyone — it's the base of every
sign-in link. If you get it wrong, fix it and redeploy; a fresh link is printed
whenever an admin has no active session.

**What "free" costs you.** Render free instances sleep after 15 minutes idle, so
the first visit after a quiet spell takes 30–60 seconds to load. Subsequent
requests are normal. Free instances also get 750 hours/month, which one service
cannot exceed.

### Railway, Fly, or any container host

The same image works anywhere. Point `DATABASE_URL` and `TURSO_AUTH_TOKEN` at
Turso and no volume is needed; or omit them, mount a volume at `/data`, and it
uses a local SQLite file instead.

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
| `DATABASE_URL`  | Yes      | Turso `libsql://…` URL, or unset to use a local SQLite file           |
| `TURSO_AUTH_TOKEN` | Yes\*  | Required whenever `DATABASE_URL` is a hosted URL                     |
| `MAX_UPLOAD_MB` | –        | Per-file upload cap. Defaults to 10                                  |
| `DATA_DIR`      | –        | Only for local SQLite. Disk mount point, defaults to `/data`          |

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

`DB_DRIVER=libsql` forces the libSQL driver even against a local `file:` URL.
That's how the test suite exercises the exact client Turso uses without needing
a hosted database.

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
    uploads.ts         File validation and database-backed storage
    adapter.ts         Picks SQLite or Turso from DATABASE_URL
```
