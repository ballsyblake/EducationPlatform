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
