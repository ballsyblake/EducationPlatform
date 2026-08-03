# Coach LMS

A Canvas-style learning platform, cut down to what a football coaching staff
actually needs. Coordinators post install work; coaches complete assignments,
take quizzes, and get feedback. Everyone signs in with an email address — no
passwords anywhere in the system.

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
- Staff management: add coaches by email, promote to admin, deactivate

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

Open http://localhost:3000/login and enter one of the seeded addresses:

| Email                       | Role                            |
| --------------------------- | ------------------------------- |
| `head.coach@example.com`    | Admin — courses and grading     |
| `marcus.webb@example.com`   | Coach — Defensive Coordinator   |
| `tj.rollins@example.com`    | Coach — Offensive Coordinator   |
| `dana.pryor@example.com`    | Coach — Linebackers             |

### Signing in without an email provider

With no `SMTP_HOST` configured the app runs in **dev mail mode**: sign-in links
are printed to the server console and appended to `.mail-outbox.log` instead of
being emailed, and the login page shows a clickable link directly. That makes
the whole flow testable with zero setup.

To send real email, set the SMTP variables in `.env`:

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

## How authentication works

1. A coach enters their email on `/login`.
2. If that address belongs to an active account, a single-use token is hashed
   and stored, and the link is emailed. Unknown addresses get the same
   "check your email" response, so the form never reveals who is on staff.
3. Clicking the link (`/auth/verify?token=…`) consumes the token, creates a
   session row, and sets an httpOnly cookie good for 30 days.

Accounts are created by an admin on `/admin/people` — signing in never creates
one. Only token *hashes* are stored, for both login links and sessions.
Deactivating a coach deletes their sessions immediately.

Uploaded files are never served statically. They're written to `uploads/` under
a random name and streamed through `/api/files/[id]`, which checks on every
request that the requester is an admin, is enrolled in the course the material
belongs to, or is the author of the submission the file is attached to.

## Deploying

The app needs a running Node process, a database, and a disk — so a static host
like GitHub Pages can't serve it. Anything that runs a container with a
persistent volume works; the repo ships config for Render and Railway.

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
| `SMTP_HOST`     | Strongly | Unset means links go to the logs instead of coaches' inboxes         |
| `SMTP_PORT`     | –        | Defaults to 587                                                      |
| `SMTP_USER`     | –        | SMTP username                                                        |
| `SMTP_PASSWORD` | –        | SMTP password                                                        |
| `MAIL_FROM`     | –        | From address, e.g. `Coach LMS <lms@yourprogram.com>`                  |
| `DATA_DIR`      | –        | Disk mount point. Defaults to `/data`                                |
| `DATABASE_URL`  | –        | Derived from `DATA_DIR` unless set explicitly                        |
| `UPLOAD_DIR`    | –        | Derived from `DATA_DIR` unless set explicitly                        |

Set `APP_URL` correctly before inviting anyone. It's the base of every sign-in
link that goes out, and a wrong value produces links that point elsewhere.

**Without SMTP, nobody can sign in but you.** Dev mail mode writes links to the
server logs, so you can retrieve your own from the host's log viewer — but your
coaches can't. Configure SMTP before rolling this out to a staff.

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
| `npm run bootstrap:admin` | Grant admin access to `ADMIN_EMAILS` without touching anything else |

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
    login/             Magic-link request form
    auth/verify/       Token consumption → session
    (app)/             Everything behind authentication
      dashboard/       Coach home
      courses/         Course list, detail, and library
      assignments/     Instructions, submission, feedback
      quizzes/         Taking a quiz and reading results
      grades/          Score and feedback history
      admin/           Courses, quiz builder, grading queue, progress, staff
    api/files/[id]/    Authorization-checked file streaming
  lib/
    auth.ts            Magic links, sessions, role guards
    access.ts          Course and upload authorization
    grading.ts         Auto-grading and score rollups
    coursework.ts      Task aggregation and progress summaries
    uploads.ts         File validation and storage
```
