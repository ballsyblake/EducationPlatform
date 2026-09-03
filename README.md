# Football Queensland platform

Two products for association football in Queensland, in one deployment:

- **[Coach Education](#coach-education)** — a Canvas-style learning platform.
  Coach educators post coursework; coaches complete assignments, take quizzes,
  and get feedback.
- **[Club Development & Assessment](#club-development--assessment-cda)** — the
  CDA Portal. Football Queensland rates each affiliated club once a year across
  four domains and awards a shield.

They share one account system, one database and one deploy. Sign-in is
passwordless — there are no passwords anywhere in the system — and running it
needs no email server. See [Signing in](#signing-in).

An account has exactly one role. `COACH` and `EDUCATOR` belong to Coach
Education; `CLUB` and `ASSESSOR` belong to the CDA Portal; `ADMIN` runs Coach
Education and may additionally be put in the **Club Development Unit**, which is
a grant of its own (`User.cdu`) rather than something admin implies. Signing in
lands you in whichever product is yours, and a link across appears in the header
for the accounts that are in both.

---

# Coach Education

## What it does

**For coaches**

- A dashboard of everything assigned, sorted by due date, with overdue items flagged
- Course pages with a library of session plans, resources and video (uploaded files or YouTube/Vimeo links)
- Assignments accepting a written response, file attachments, or both — with drafts you can save and come back to
- Quizzes with multiple-choice, true/false, and written questions
- A Grades & Feedback page collecting every score and written comment in one place, and where each course stands against its pass mark
- Your own row of the course register: the hours you sat on each day, your rating out of five, and the write-up of every session an educator watched you deliver
- Any hours you owe from a day you missed, and where they are being made up
- Post-course support if you're rated below the mark: an educator watches you deliver a session again, live or on film

**For admins (coach educators / technical staff)**

- Create courses, enroll staff, and publish or hide coursework
- Author assignments and build quizzes question by question
- A grading queue: score submissions, review written quiz answers, add feedback, or send work back for revision
- A photo of each coach, taken on the phone from the register, so whoever assesses their delivery in Block 3 knows who is who
- A coaches list: every coach and where they stand on each course — hours, rating, outcome — filterable by course and outcome, searchable by name or club
- The attendance register: nine delivery days, the roster, catch-ups, the CET team, and the results block — one screen per course
- An assessor's course page: take the roll for one day, write up a coach's delivery on the register's own form, leave a general comment, and rate them at the end of the course — what is done on the grass, and nothing else
- An hours desk: who is short, what they owe, and where it is being made up — across every course at once
- A post-course support desk: who was rated below the pass mark, who is booked in, whose film is waiting to be reviewed
- A staff progress dashboard — completion, overdue counts, and averages per coach, filterable by course
- Staff management: add coaches by email, hand out sign-in links, promote to admin, deactivate

**Grading model.** Multiple-choice and true/false questions score the instant a
coach submits. Written answers can't be auto-graded, so an attempt containing
one lands in the grading queue as `AWAITING_REVIEW` until an educator reads it
and awards points. Assignment submissions are always graded by a human.

## Who can do what

Three roles on this side of the app, and the middle one is the point.

| | Coach | Educator | Admin |
| --- | --- | --- | --- |
| See course content, submit work | ✓ | ✓ | ✓ |
| Mark the register, rate deliveries, grade, run support | | **their courses** | every course |
| Raise and settle make-up hours, record transfers | | **their courses** | every course |
| Create, publish, delete a course; author coursework | | | ✓ |
| Add accounts, change roles, deactivate | | | ✓ |
| The Club Development portal | | | only with the `cdu` grant |

**The navigation shows only what an account can use.** Courses and Grades &
Feedback need an enrolment — an admin who has never been enrolled has no courses
and no grades of their own, and two tabs leading to an empty state are two tabs.
The five course-scoped staff tabs need a seat on a course team; Manage stays
regardless, because it is the one page that explains its own emptiness ("you
aren't rostered onto a course yet") rather than leaving a new educator on a
dashboard with no way forward. Support appears for a coach once they have a
case, and Club Development on the `cdu` grant.

The conditions are all stable properties of the account — enrolled, rostered, in
the Unit — and never a count of outstanding work. A tab that vanished whenever
its queue emptied would be worse than a quiet one: an educator would learn where
Grading lives, come back on a clear morning, and find it gone.

**An educator's courses** are the ones they are rostered onto as `CourseStaff` —
the CET1–CET5 seats the registers already record. Everything they can reach is
filtered to those courses: the grading queue, the support desk, the hours desk,
the coaches list, progress, and the course list itself. Another course's
register is a redirect, not a 403, for the same reason a coach gets a 404 on a
course they aren't on.

Being staff is not the same as being staff *here*: `requireStaff()` gets you
through the door and `assertCourseStaff(user, courseId)` gets you into the room,
and every action that writes a mark, a grade, a rating or a case calls both.
Educators are exactly the people who assess coaches, so the importer now creates
a course team as `EDUCATOR` — it used to create them as `ADMIN`, which also
handed each of them every club's assessment in the other product.

**The Club Development Unit** is `User.cdu`, granted from the Staff page on an
admin and nowhere else. It used to be `role === "ADMIN"`, so promoting an
educator in Coach Education silently gave them the entire Unit. Revoking it ends
their sessions, because access withdrawn at the next sign-out is not withdrawn.
The last active Unit member cannot be removed, demoted or deactivated from the
Staff page: somebody has to be able to run the cycle, and an empty Unit can only
be refilled from inside the Unit. `ADMIN_EMAILS` is the way back in either way —
`bootstrap-admin` grants the Unit as well as the role, on every boot.

## The attendance register

Football Queensland runs its AFC/FA diplomas off one spreadsheet per course:
nine delivery days across three blocks, a roster, a catch-ups block for coaches
making up time, the CET team's own attendance, and a grid of Yes/No between
them. Beside it sits an assessment sheet holding each coach's practical
deliveries and a rating out of five.

That register lives in the app at `/admin/courses/<id>/register`:

- **The grid.** Roster, catch-ups and course team, days as columns. Tick a box
  to mark someone present; a day heading marks the whole column at once. Nothing
  is written until you save, because a register kept on a touchline needs a
  mistake to be correctable before it counts.
- **Part days.** A tick is the whole day. For anything less, click *part* under
  the cell and type the hours actually sat. Attendance is held in minutes, not
  as a yes/no — see [Hours and make-ups](#hours-and-make-ups).
- **The results block.** Attendance met, journal, rating, outcome, readiness and
  the register's own comments, for every coach on one screen.
- **Practical deliveries.** Each coach's assessed sessions — assessor, block,
  component, topic, comment, action plan and session rating — written on the
  assessor's course page below, readable by the coach on their own course page,
  and by an educator writing up a reassessment.

A coach sees their own row: which days they were marked present, their rating
and what that rating means, and every write-up an educator left them.

### The course page an assessor works from

The register is the shape of the course at the end of it. It is the wrong shape
for the three things somebody standing on the grass actually does, so those have
a page of their own at `/admin/courses/<id>/assess` — the page an educator lands
on from Manage, and the only one they need on the day:

- **Take the roll, one day at a time.** Pick the day — it opens on today, or on
  the last day the course ran — and tick a list of names with a face beside
  each. *Part day* records the hours actually sat, exactly as the grid does.
  Nothing is written until you save, and Save posts every day the register has
  marks for, so correcting yesterday from today's screen doesn't lose it.
- **Write up a delivery.** The register's own form, field by field: assessor,
  when, component, topic, comment, a numbered action plan, and the session's
  rating out of five. It saves the parsed columns *and* the whole form as text
  in the shape the FQ registers write it, so a delivery typed here and one
  imported from a spreadsheet read identically:

  ```
  Assessor: Priscilla Tan
  When: Block 2
  Component: Play
  Topic: Staying on ball to escape pressure

  Comment:
  …

  Action plan:
  1. …
  2. …

  Session Rating: 3
  ```

  The rating is optional, because better than half the write-ups on the 2026
  registers carry feedback and no session mark — and a coach's course rating is
  a judgement across everything they delivered, never an average of it.
- **Say how the coach is going, and rate them at the end.** One card per coach
  carrying the register's Comments column and, once the course is over, the
  course rating — the judgement across everything they delivered, never an
  average of their sessions. The outcome is not asked for: it follows the
  rating, passed at or above the course's mark and post-course support below
  it, and an enrolment already withdrawn or transferred keeps the outcome it
  has. The comment stays with the course team; the delivery write-up is the
  part the coach reads.

Everything else a course carries — moves and part intakes, the hours ledger, the
rest of the results block, the course settings — is the program's paperwork
rather than the assessor's, and stays on the register, one link away. The
register's own results table still sets attendance met, the journal and
readiness, and still rates a whole course on one screen; the assessor's page
rates one coach where their write-ups already are.

### Seeing across the registers

A register answers for one course. A coach who missed Day 6 on the Sunshine
Coast and is sitting it at Gold Coast Knights appears on two of them, and
`/admin/coaches` is the page that reads across the lot: **one row per
enrolment**, not per person, because a coach on two courses has two standings
and averaging them would describe neither.

Each row carries hours sat against hours run, hours owed and hours unaccounted,
the rating and its FA band, the outcome, whether a support case is open, the
journal and the count of assessed deliveries. Filter by course or outcome —
including *Hours unaccounted*, which is the "who has nobody looking at them"
list — and search a name, a club or a course. Every figure comes from
`summariseAttendance` and `courseResult`, the same functions the register uses,
so this is a second view of the register rather than a second opinion about it.

`/admin/progress` is left to the question it actually answers: coursework
completion, which is what the online courses are marked on and is no measure at
all of a diploma.

### Knowing who is who

A B Diploma runs twenty-five coaches across nine days and three blocks, months
apart, often with a different educator on the grass each time. The register
gives them names; **Who's who** on the same page gives them faces.

- **Taking one** is `<input type="file" accept="image/*" capture="environment">`
  — on a phone that opens the camera directly, on a laptop it's an ordinary file
  picker. No permissions prompt, no `getUserMedia`, nothing to install, which
  matters when the person using it is standing on grass.
- **The browser shrinks it first**: centre-cropped to a 512px square JPEG,
  roughly 6–60 KB, before anything is uploaded. A phone takes three to five
  megabytes, and a register showing twenty-five coaches would otherwise pull a
  hundred of them on every load. EXIF orientation is applied during the decode,
  so portrait photos aren't stored sideways. The server caps a photo at 400 KB —
  a file arriving near that is a client that skipped the resize, not a coach who
  stood too far back.
- **It hangs off the account, not the enrolment.** The point is recognising the
  same coach across courses and years, and a photo per intake would mean taking
  it again every time. One current photo, replaced rather than accumulated: this
  is a name badge, not an album.
- **Who can set it**: coach education staff, and the coach themselves at
  `/account`. Staff because it is taken on the day by the educator running the
  course; the coach because it is their likeness.
- **Who can see it**: the same two. `canAccessUpload` returns 404 to every other
  coach, and to the Club Development portal's assessors and club administrators —
  checked before any other rule, so a photo can never fall through to a rule
  written for a different kind of file.
- **Removing it** is a button on the register and on the coach's own account
  page, and it deletes the bytes rather than just unlinking them.

Faces appear on the register grid, in **Who's who**, on the coaches list, and on
a post-course support case — where an educator arriving to reassess a delivery
has often never met the coach, because the referral came off somebody else's
register weeks ago. Everywhere else falls back to initials.

### Moves and part intakes

Not everybody does all nine days of the course they are listed on. Coaches join
at Block 2 and pick up Block 1 elsewhere; coaches do Block 1 at one venue and
start again at the next intake. Without saying so, both read as somebody who
didn't turn up, and the register puts them twenty-four hours short of a standard
nobody was applying.

An enrolment therefore has a **window**: `joinedAt` and `leftAt`, both null in
the ordinary case. Days outside it drop out of the requirement *and* out of the
hours sat, and show on the register as a dash rather than an empty box — an
empty box means "didn't turn up", which is the wrong thing to say about somebody
who had already moved to another intake. Marks recorded outside the window are
kept, not deleted: the register is the record of what was written down on the
day.

A **move** is one operation, because its parts are only correct together —
`/admin/courses/<id>/register` → *Moves and part intakes*:

1. the origin closes at the coach's last day there,
2. the destination opens at their first day (joining an enrolment that already
   exists, rather than creating a second one),
3. the two are linked one-to-one through `transferredToId`, so "transferred" can
   never be recorded without saying where to,
4. **hours still owed go with the coach**, off the register they have left,
5. the origin's outcome becomes `TRANSFERRED` — but only if it was still
   `IN_PROGRESS`. A coach who was rated and passed there passed there, and
   moving them afterwards is not a reason to erase an educator's decision.

Hours already sat are deliberately **not** added to the new course's total. A
coach who did Block 1 at one venue and started again at another has sat those
days twice, and quietly adding them would report a qualification as
three-quarters done on the strength of the same three days counted twice. The
link makes them visible from both ends; whether they are worth crediting is a
judgement, and the make-up ledger is where a judgement gets written down.

### Hours and make-ups

Attendance is **minutes, not a tick**. FQ's registers are full of half days —
"Missed Day 2 PM", "3 hours missed on Day 2", "1.5 hours Day 3" — and a boolean
rounds every one of them to a whole day in one direction or the other, which is
why the spreadsheets end up recording them in the Comments column, where nothing
can add them up.

- A day is worth its scheduled length (`startTime`–`endTime`). A day with no
  times recorded is worth nothing rather than a guessed eight hours: an invented
  denominator would put a whole roster into debt against a standard nobody has
  stated.
- Only **days the register has actually taken** count towards what a coach owes.
  A course in its first block has six days ahead of it, and measuring anybody
  against them would show the entire roster forty-eight hours short.
- A **catch-up** enrolment has no requirement of its own. It exists to host
  hours owed on another course.

Time missed becomes a debt when an educator says so, not automatically. That
debt is an `AttendanceMakeUp`, and it follows the coach rather than the course —
which is the whole point, because a coach who misses Day 6 on the Sunshine Coast
usually sits it at Gold Coast Knights three weeks later, and no single register
can say whether they are square. A make-up is `OWED`, `ARRANGED`, `COMPLETED` or
`WAIVED`, carries the hours credited so far, and can point at the attendance row
that paid it off.

Two numbers do most of the work, and the difference between them is the point:

| | |
|---|---|
| **Owed** | Raised on the ledger and not yet covered. Somebody is dealing with it. |
| **Unaccounted** | Hours missing that nobody has raised anything for. These are the ones an educator needs to see. |

Days outside a coach's window count towards neither.

The hours desk at `/admin/make-ups` shows both, across every course: the open
ledger, and everybody short with nothing raised — each with a form to raise the
debt on the spot. The same panel appears on a course register, scoped to that
course. A coach sees their own outstanding hours on their dashboard and on their
course page.

**The importer reads the margins.** `courses:import` understands three shapes in
the Comments column — "Missed Day N AM/PM", "N hours missed on Day N", "full day
of Day N" — and turns each into a corrected attendance figure plus an `OWED`
make-up quoting the original comment. Anything vaguer ("needs to catch up a few
hours on another B") is printed at the end of the run for a person to raise by
hand, never guessed at.

### How a course is rated

Coaches are not scored on coursework percentages. They are rated **1 to 5 in
half steps** against Football Australia's rubric, which ships inside every FQ
register and is transcribed in `src/lib/support-rubric.ts`:

| Criterion                                                                    | Group             |
| ---------------------------------------------------------------------------- | ----------------- |
| Participation / Engagement                                                    | Course            |
| Objective · Content · Organisation · Presenting · Coaching · Environment      | Practical delivery |

The rating maps to one of two outcomes, and the line between them is 2.5:

| Rating    | Football Australia | Outcome              |
| --------- | ------------------ | -------------------- |
| 3.5 – 5   | Highly Competent   | Pass on course       |
| 2.5 – 3   | Competent          | Pass on course       |
| 1 – 2     | Not yet competent  | Post-course support  |

A course carries its own `ratingThreshold` — 2.5 on every diploma — so a future
licence can set a different bar. Leave it blank and the course isn't rated at
all, and nobody on it can fall short.

The register won't hold an outcome the rubric doesn't allow: recording a coach
rated 2 as having passed is refused, both in the form and again on save.
Withdrawing is always available, because leaving a course is not a judgement
about a delivery.

## Post-course support

Rated below the mark, and the rubric's own name for what happens next is
**post-course support**. Those coaches appear on `/admin/support` under *Rated
below the pass mark*.

Coming up short doesn't fail anyone. A rating says what an educator saw across
the course; it doesn't say what the coach can do given the feedback. So a
shortfall opens a **support case**, and the coach is reassessed on a delivery by
one of two routes:

- **Live assessment** — an educator attends one of their sessions and observes it.
- **Video review** — the coach films a session and submits the link.

Which route is a matter of geography and diaries, not of standard. A coach five
hours from Brisbane sends film because of the drive, and is held to exactly what
a coach observed in person is held to: the same seven criteria, on the same
scale.

**How a reassessment is marked.** Every criterion carries a mark — a blank is
not a pass — and the delivery's overall rating is the mean, snapped to the
half-step scale and computed on save rather than read from the form. If that
figure lands below the course's pass mark, a successful outcome isn't available:
the form doesn't offer it and the action refuses it. An educator who means to
pass the coach has to move the marks and own it.

**The flow.** An educator refers the coach and books the first assessment in one
step → the coach either has an educator come out, or submits film → the educator
marks the seven and records an outcome. *Successful* closes the case, writes the
new rating back to the register, and passes the course. *Not yet successful*
leaves it open for the next attempt. A case allows two assessments by default —
the reassessment and one further opportunity — which an educator can raise where
circumstances warrant it.

Nobody is referred automatically. A coach half a point short after a
bereavement and a coach who never engaged both land in the same list, and the
educator decides which conversation each of them needs — but neither is quietly
lost, which is what happens when "who didn't pass?" is a question somebody has
to assemble by hand.

Film is a **link**, never an upload: session footage is hundreds of megabytes
and this app keeps its files in the database. YouTube and Vimeo play inline on
the educator's page — unlisted, not private. The session plan and anything else
on paper can be attached as normal.

A coach only sees a **Support** tab once they have a case. Most coaches never
will, and a permanent tab reads as an accusation to everyone who doesn't need
one.

## Loading a real intake

```bash
npm run courses:import -- --dry-run   # say what would change, write nothing
npm run courses:import -- --yes       # do it
```

Reads `prisma/data/b-diploma-2026.json` — three 2026 B Diploma registers,
extracted from FQ's spreadsheets by `scripts/extract-b-diploma-2026.py`. Two
steps rather than one, matching `cda:import-2026`: the registers are the coach
education team's working documents and will change shape next intake, while the
JSON is a flat record of one intake that can be reviewed, diffed and re-imported
without Excel in the loop. Re-run the extractor when the registers move:

```bash
python3 scripts/extract-b-diploma-2026.py <register.xlsx> [...]
```

Every write is an upsert keyed on something stable, so a second run corrects the
first rather than duplicating it. It opens no support cases — plenty of coaches
sit below the pass mark, and every one of those is a conversation an educator
has before a case exists. It never disturbs a transfer, an enrolment window or a
make-up an educator recorded afterwards.

### On a host with no shell

Render's free plan has no shell, so there is no command line to type that into.
Set **`B_DIPLOMA_IMPORT_2026=1`** in the service's Environment tab instead:
saving redeploys, and `docker-entrypoint.sh` runs the import in the background
*beside* the web server rather than in front of it. Watch the logs for
`[courses] imported in Ns`, then remove the variable.

Beside, not before, because an import that holds up the port costs the deploy:
the CDA season's first run against the hosted database took over fourteen
minutes, the host stopped scanning for an open port after five, and the deploy
was killed with the season half-loaded. Nothing about either import is a
prerequisite for serving.

Two guards, because a data import that runs itself is worth being careful with.
The variable arms it; a row in `Meta` disarms it permanently once it succeeds,
so a variable left set costs one query per boot rather than the whole import
again. Failure writes no marker, so fixing the cause and redeploying retries.
`B_DIPLOMA_IMPORT_2026=force` re-runs over a completed import — for when a fix
to the importer needs applying to a database that already ran it.

`FQ_IMPORT_2026` does the same for the Club Development season.

**Addresses in that file are anonymised.** The registers carry every coach's
real address and this repository is public to whoever can read it; names are
kept, because they are what makes the data worth testing against, but each
address is rewritten to `first.last@example.com`. Nothing in the file can mail a
real person. It is still real people's assessment history, so the import is a
deliberate command and never runs at boot or on deploy.


---

# Club Development & Assessment (CDA)

Football Queensland assesses affiliated clubs each year to determine how well
they develop players and operate as a football organisation. Clubs are rated
across four domains and awarded a shield — Bronze, Silver, Gold or Platinum.

## The rating

| Domain                       | Default weight | How it is scored                                                            |
| ---------------------------- | -------------- | --------------------------------------------------------------------------- |
| **Technical Qualifications** | 30%            | From the club's staff register — qualification, experience, employment type |
| **Planning**                 | 20%            | 13 criteria scored by assessors                                             |
| **Delivery**                 | 30%            | 14 criteria scored by assessors                                             |
| **Outcomes**                 | 20%            | 13 criteria scored by assessors                                             |

Forty criteria across the three assessed domains, each carrying 163 evidence
points between them. An assessor never awards a star directly: they tick the
evidence points they saw, and the count maps to a 0–3 star band whose
thresholds are shown beside it. Stars are recomputed server-side on save and
never read from the form.

**Non-Negotiables.** Nine mandatory checks — a qualified Technical Director,
Blue Card compliance, female coaching presence, minimum coaching ratios, all
players registered, governance and AGM, member protection, insurance and
facilities, and financial standing with FQ. Failing any one means no shield at
all, whatever the score. An unverified check counts against eligibility exactly
as a failure does: a shield awarded on unchecked evidence is the outcome the
gate exists to prevent.

Weights and shield thresholds are stored **per cycle**, so re-tuning next year's
rubric cannot change what a club was awarded in a year already published. The
full rubric is visible in the app at `/cda/cdu/rubric`.

## The three roles

**Club.** The club's designated administrator. Enters the technical staff
register, declares the nine Non-Negotiables, reports participation figures, and
submits. Sees only their own club, and only their shield, overall percentage,
four domain scores and Non-Negotiable verdicts — no weights, no thresholds, no
criterion-level stars, no assessor names.

**Assessor.** Scores the clubs assigned to them, up to three assessors per club.
Sees only their own scores, never the other assessors' — three independent
judgements is the point, and one visible score anchors the next two. Has
read-only access to everything the club submitted, so Outcomes can be scored
against the club's own figures.

**Admin / CDU.** Football Queensland's Club Development Unit. Manages clubs,
the assessor pool and the cycle; verifies Non-Negotiables; reconciles the
assessors into one score; locks and releases the rating.

## The flow

1. Club enters staff, metrics and Non-Negotiable declarations, then submits.
2. Up to three assessors score Planning, Delivery and Outcomes independently.
3. When the last assessor submits, the club moves to reconciliation on its own.
4. The CDU accepts everything the assessors agreed on in one action, then works
   through what is actually split. Each row pre-selects the median; departing
   from it asks for a rationale.
5. Locking computes the weighted total, determines the shield, applies the
   Non-Negotiable gate, and **freezes** all of it onto the assessment row.
6. Releasing makes the rating visible to the club.

Before the lock every view recomputes live, which keeps the CDU's in-flight
picture honest. After it, the frozen columns are read back — so a criterion
reworded next March cannot move a rating a club was given in June. Unlocking
clears the frozen columns rather than leaving a stale result beside a live one.

## Trying it

```bash
npm run cda:seed     # catalogue + six demo clubs at every stage of the flow
```

| Email                            | Role                                              |
| -------------------------------- | ------------------------------------------------- |
| `head.coach@example.com`         | Admin / CDU — the whole cycle                     |
| `admin@cityside.example.com`     | Club — Brisbane Cityside, rated Gold              |
| `admin@rockycentral.example.com` | Club — Rockhampton, ineligible on two checks      |
| `admin@tropics.example.com`      | Club — Cairns, still entering data                |
| `a.baptiste@fq.example.com`      | Assessor — five clubs, one part-scored            |
| `n.calloway@fq.example.com`      | Assessor — two clubs                              |

`npm run cda:catalog` seeds only the rubric — criteria, Non-Negotiables,
qualification ladder, structure roles and the per-shield structure standards. It
is additive and never overwrites wording the CDU has since edited, so it is safe
to run on every deploy, and it is the only thing a deployed instance runs at
boot. **Demo clubs never reach production**: they need `cda:seed` explicitly.

### Starting clean

```bash
npm run cda:reset          # shows what would be deleted, does nothing
npm run cda:reset -- --yes # actually clears it
```

Clears every club, assessment, score, review, structure entry and portal
account, then reloads the rubric. Admin accounts, the rubric itself and Coach
Education are left alone — admins are how anyone gets back in, and the two
products share a deployment but nothing else.

Pass `--keep-cycles` to empty the clubs out of a season without deleting the
season. After a reset, sign in as an admin, open a cycle at `/cda/cdu`, add your
clubs and create an administrator account for each; the sign-in link is shown
once, on screen, for you to hand over.

### How the assessment works

`docs/how-a-shield-is-awarded.pdf` walks the whole season end to end — the three
roles and their handoffs, vertical assessment, how points become a shield, the
two Non-Negotiable mechanisms, and the review and appeal clock. The HTML source
sits beside it; `node docs/build-pdf.mjs` rebuilds the PDF after an edit, and
prints what it needs if Playwright isn't installed.

---

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

| Email                     | Role                                            |
| ------------------------- | ----------------------------------------------- |
| `head.coach@example.com`  | Admin — courses, grading and support            |
| `marcus.webb@example.com` | Coach — Technical Director                      |
| `tj.rollins@example.com`  | Coach — passed on his second support assessment |
| `dana.pryor@example.com`  | Coach — U15 Girls Head Coach                    |
| `elliot.snow@example.com` | Coach — film submitted, waiting on a review     |
| `sam.okafor@example.com`  | Coach — live assessment booked                  |
| `priya.raman@example.com` | Coach — below the pass mark, no case opened yet |

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
MAIL_FROM="Coach Education <coaching@footballqueensland.com.au>"
APP_URL="https://lms.yourprogram.com"
```

`APP_URL` must be set correctly in production — it's the base of every magic
link that goes out.

Free options exist if you want email without a bill: a Gmail app password works
over SMTP, as does Brevo's free tier. Neither is required.

## Brand

The interface follows the Football Queensland Brand Guidelines (V2.0).

**Colour.** Maroon `#88133D` leads, with Deep Maroon `#621333` as the second
primary — they sit at `maroon-600` and `maroon-800` so the token always resolves
to the exact brand value rather than an approximation. Neutrals are tints of
black, per the note that black is a text colour or a 10% tint as a background
and never a main brand colour; `ink-100` is that 10% tint. The four highlight
colours appear only as small tinted fills behind dark text — at full strength
they are far too light to read as type.

Two decisions worth knowing, both open to override:

- **The palette has no red**, so anything urgent — overdue work, errors,
  destructive buttons — speaks in Maroon, and destructive actions are set apart
  by shape (outlined) rather than hue. If you would rather have a conventional
  red for danger, that is a deliberate departure from the guidelines and needs a
  call from Marketing.
- **A positive figure uses the darkened green** rather than Maroon, so an
  all-clear on the dashboard does not read as an alarm.

**Type.** Gibson is the brand typeface. It is licensed, so it is not bundled;
the guidelines name Arial as the substitute where Gibson is unavailable, which
is what renders. Add a licensed Gibson webfont and it takes over automatically —
the stack is `--font-brand`. Main headlines are SemiBold, all caps and tracked
out to match the logo (the `.headline` class); sub-headings and body stay in
sentence case.

**Logo.** No logo is drawn anywhere in this codebase. The guidelines forbid
re-creating, re-drawing, or typesetting it, so the app renders official artwork
when supplied and otherwise shows its own name in brand type. See
[`public/brand/README.md`](public/brand/README.md) for how to add the files —
including which version belongs on the Deep Maroon header versus the white
sign-in page.

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
with a message pointing at the alternative. Session plans, PDFs and images are
all comfortably under that. Video should go in as a **link** —
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
| `ADMIN_EMAILS`     | your own email address                       |

`APP_URL` is deliberately not required. Render injects `RENDER_EXTERNAL_URL`
with the service's real public URL, and the app falls back to it — so sign-in
links are correct on the first deploy, before you know your hostname. Set
`APP_URL` only when you put a custom domain in front.

**3. Sign in.** The first boot applies the migrations, creates your admin
account, and prints a sign-in link to the deploy logs. Open Render's log viewer,
click the link, and add your staff from the Staff page.

If you do set `APP_URL`, it has to be right before you invite anyone — it's the
base of every sign-in link. Get it wrong and you can just fix it and redeploy: a
fresh link is printed whenever an admin has no active session.

**Locked out?** Set `ADMIN_LINK=1` and save. The next boot prints a fresh
sign-in link for every `ADMIN_EMAILS` address, whatever the database thinks
about their sessions. Remove it once you're in.

A link is normally only printed for an admin with **no live session**, so that a
working credential doesn't land in the deploy log every time the service
restarts. The trap is that a session row lives for sixty idle days: an admin who
cleared their cookies, changed browser or lost the laptop stays locked out for
two months while every redeploy reports *"has an active session; no link
needed"*. The check can only ask whether a session row exists; only you know
whether you can actually get in. `ADMIN_LINK=reset` also ends those sessions,
for when the device is gone rather than merely forgotten.

**What "free" costs you.** Render free instances sleep after 15 minutes idle, so
the first visit after a quiet spell takes 30–60 seconds to load. Subsequent
requests are normal. Free instances also get 750 hours/month, which one service
cannot exceed.

### Railway, Fly, or any container host

The same image works anywhere. Point `DATABASE_URL` and `TURSO_AUTH_TOKEN` at
Turso and no volume is needed; or omit them, mount a volume at `/data`, and it
uses a local SQLite file instead.

### How migrations are applied

`docker-entrypoint.sh` runs on every boot and is safe to re-run: it applies any
pending migrations, ensures everyone in `ADMIN_EMAILS` can sign in, and starts
the server. Migrations only ever move forward — nothing is reset or dropped.

**Why not `prisma migrate deploy`?** Prisma 7's config file has no `adapter`
field, so the CLI hands `datasource.url` straight to its own engine, which
rejects a `libsql://` URL with *"The scheme is not recognized in database URL"*.
`scripts/migrate.ts` runs the same migration SQL through the libSQL client
instead, recording it in the same `_prisma_migrations` table with the same
sha256 checksum format Prisma uses. So `prisma migrate dev` locally and this
runner in production stay interoperable — `prisma migrate status` reports a
runner-built database as up to date, and neither reapplies the other's work. The
runner refuses to start if an already-applied migration file has been edited.

### Environment variables

| Variable        | Required | What it does                                                        |
| --------------- | -------- | ------------------------------------------------------------------- |
| `APP_URL`       | No       | Only for a custom domain; falls back to `RENDER_EXTERNAL_URL`        |
| `ADMIN_EMAILS`  | Yes      | Comma-separated admins, granted access on boot                       |
| `SMTP_HOST`     | No       | Only needed if coaches request their own links                       |
| `SMTP_PORT`     | –        | Defaults to 587                                                      |
| `SMTP_USER`     | –        | SMTP username                                                        |
| `SMTP_PASSWORD` | –        | SMTP password                                                        |
| `MAIL_FROM`     | –        | From address, e.g. `Coach Education <coaching@footballqueensland.com.au>`                  |
| `DATABASE_URL`  | Yes      | Turso `libsql://…` URL, or unset to use a local SQLite file           |
| `TURSO_AUTH_TOKEN` | Yes\*  | Required whenever `DATABASE_URL` is a hosted URL                     |
| `MAX_UPLOAD_MB` | –        | Per-file upload cap. Defaults to 10                                  |
| `FQ_IMPORT_2026` | –       | Set to `1` to load the 2026 CDA season on the next boot; `force` re-runs |
| `B_DIPLOMA_IMPORT_2026` | – | Set to `1` to load the 2026 B Diploma registers on the next boot; `force` re-runs |
| `ADMIN_LINK`    | –        | Set to `1` to print a fresh admin sign-in link on the next boot; `reset` also ends their sessions |
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
| `npm run db:migrate` | Create and apply a migration (local development)   |
| `npm run db:deploy`  | Apply pending migrations (SQLite or Turso)         |
| `npm run db:seed`    | Reset seeded data and reload the sample program    |
| `npm run cda:catalog` | Seed CDA criteria, Non-Negotiables and qualifications (additive, safe on every deploy) |
| `npm run cda:seed`   | The catalogue, plus demo clubs, assessors and assessments |
| `npm run db:reset`   | Drop the database, re-migrate, and re-seed both products |
| `npm run db:studio`  | Browse the database in Prisma Studio               |
| `npm run bootstrap:admin` | Grant admin access to `ADMIN_EMAILS` and print a sign-in link |

`prisma`, `tsx`, and `dotenv` are runtime dependencies rather than dev ones
because the container runs migrations and the admin bootstrap on boot.

## Moving to another database

Turso is supported out of the box — set `DATABASE_URL` to a `libsql://` URL and
`TURSO_AUTH_TOKEN`, and `src/lib/adapter.ts` picks the driver automatically.

For Postgres, change the `datasource` provider in `prisma/schema.prisma`, swap
in `@prisma/adapter-pg` in `src/lib/adapter.ts`, regenerate the migrations, and
point `DATABASE_URL` at the server. `scripts/migrate.ts` is libSQL-specific, so
a Postgres deployment would go back to `prisma migrate deploy`, which works
there because Prisma's engine speaks `postgresql://` natively.

The one SQLite-specific workaround in application code is in
`enrollAllCoaches`, which filters duplicates itself because SQLite has no
`skipDuplicates`.

## Layout

```
prisma/
  schema.prisma        Data model for both products
  seed.ts              Sample coaches, courses, and graded history
  cda-catalog.ts       The FQ rubric as shipped: 40 criteria, 9 Non-Negotiables,
                       the AFC/FA qualification ladder
  cda-seed.ts          Catalogue seeding (additive) and demo clubs (destructive)
src/
  app/
    login/             Sign-in link request
    auth/verify/       Token consumption → session
    (app)/             Coach Education, behind authentication
      account/         Your details and signed-in devices
      dashboard/       Coach home
      courses/         Course list, detail, and library
      assignments/     Instructions, submission, feedback
      quizzes/         Taking a quiz and reading results
      grades/          Score and feedback history
      admin/           Courses, coaches, quiz builder, grading queue, hours,
                       progress, staff
    (cda)/cda/         Club Development & Assessment
      club/            Staff register, Non-Negotiables, participation, rating
      assess/          An assessor's clubs and the scoring screen
      cdu/             Cycle board, clubs, assessors, rubric,
                       reconciliation, lock and release
    api/files/[id]/    Authorization-checked file streaming
  lib/
    auth.ts            Sign-in links, sliding sessions, role guards
    access.ts          Course and upload authorization
    grading.ts         Auto-grading and score rollups
    coursework.ts      Task aggregation and progress summaries
    attendance.ts      Pure hours: day lengths, totals, debts and shortfalls
    coaches.ts         The cross-course roster: one row per enrolment
    support-rubric.ts  FA's 1-5 rubric, bands, and the support pathway
    uploads.ts         File validation, database-backed storage, photo caps
    adapter.ts         Picks SQLite or Turso from DATABASE_URL
    cda/
      rubric.ts        Role weights, points, star thresholds — the fixed rubric
      scoring.ts       Pure scoring: domains, shield, eligibility, agreement
      assessment.ts    Assembles an assessment; freezes the result at lock
      access.ts        Club / assessor / CDU authorization
scripts/
  migrate.ts           Applies pending migrations to SQLite or Turso
  bootstrap-admin.ts   Ensures ADMIN_EMAILS can sign in; prints a link
  seed-cda.ts          Seeds the CDA catalogue, optionally with demo data
```

`src/lib/cda/scoring.ts` touches no database — it takes plain rows and returns
plain results. That is what makes the rubric testable, and what lets the
reconciliation screen show the total a criterion *would* produce before
anything is written down.
