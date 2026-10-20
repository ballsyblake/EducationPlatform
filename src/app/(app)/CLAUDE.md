# Coach Education

Everything under `/dashboard`. FQ runs AFC/Football Australia diplomas off one
spreadsheet per course; this is that spreadsheet, plus the coursework around it.

`README.md` at the root carries the rubric, the scoring and the roles. Read it
before changing anything about how a coach is rated.

## The shape of it

```
dashboard/          Coach home; an educator is redirected to their list
educator/           An assessor's whole view: one list of their coaches
courses/[id]/       What a coach sees: library, their own register row, results
assignments/ quizzes/ grades/   Coursework and its feedback
support/[id]/       A coach's own post-course support case
admin/
  page.tsx          Manage — course list; the create form is admin-only
  courses/[id]/     Course settings and coursework authoring (ADMIN only)
    register/       The attendance register. The page educators live on.
  coaches/          Every coach, one row per enrolment, across all registers
  grading/          The queue: submissions and written quiz answers
  support/          The post-course support desk
  make-ups/         Make-up days — debts that follow a coach across courses
  progress/         Coursework completion (the online courses' measure)
  people/           Accounts and roles (ADMIN only)
  actions/          Every server action for the above
```

## Libraries

| | |
|---|---|
| `lib/attendance.ts` | Pure hours. Day lengths, totals, debts, enrolment windows. No database. |
| `lib/support-rubric.ts` | FA's rubric: 7 criteria, 1–5 in half steps, bands, verdicts. Client-safe. |
| `lib/delivery-rubric.ts` | FA's assessor guide: 6 areas, 0–3 each, 18 points, thresholds per diploma. Client-safe. |
| `lib/courses.ts` | Where a cohort stands: delivered, what it still owes, closed. Pure. |
| `lib/support.ts` | Support-case queries. `server-only`. |
| `lib/coaches.ts` | The cross-course roster: one row per enrolment. `server-only`. |
| `lib/coursework.ts` | Task aggregation and progress summaries. |
| `lib/educator.ts` | The assessor's list: the three jobs, per coach. `server-only`. |
| `lib/grading.ts` | Auto-grading and score rollups. |
| `lib/diploma-coursework.ts` | What a B or C Diploma requires, and putting it on the courses that owe it. |

`attendance.ts` and `support-rubric.ts` are deliberately pure — the register,
the desks and the coach's own page all total the same way rather than three
approximations of it. **Keep database access out of them.**

## Things that are true here and easy to get wrong

- **Attendance is minutes, not a tick.** A day is worth its scheduled length; a
  day with no times is worth zero, never a guessed eight hours. Only days the
  register has *taken* count towards a requirement, and only days inside a
  coach's `joinedAt`/`leftAt` window.
- **A `CATCH_UP` enrolment has no requirement of its own.** It exists to host
  hours owed on another course.
- **Time missed becomes a debt when a person says so.** `AttendanceMakeUp` is
  raised deliberately. The distinction between *owed* (somebody is dealing with
  it) and *unaccounted* (nobody has looked) is the whole point of the ledger —
  don't collapse them.
- **Hours are not carried across a transfer automatically.** A coach who sat
  Block 1 twice has not done three-quarters of the qualification. The link makes
  the hours visible; crediting them is a judgement, written on the ledger.
- **Two instruments, and neither converts into the other.** `support-rubric.ts`
  rates a coach 1–5 in half steps and is what the register's columns, the pass
  mark, the support desk and every imported 2026 score are in.
  `delivery-rubric.ts` scores one session 0–3 across six areas out of eighteen,
  which is what Football Australia's assessor guide asks of a tutor on the
  grass, and what `/educator/grading/<enrolment>` writes. A delivery can carry
  both; nothing derives one from the other, because nobody has published a
  conversion. The *outcome* of a scoresheet is arithmetic and is derived; the
  course rating is a judgement and stays a person's to set.
- **A rating decides an outcome, and the action enforces it.** Below the
  threshold cannot be "Passed"; the form won't offer it and `saveResults`
  refuses it. An educator who means to pass somebody short has to move the
  marks and own it.
- **Nobody is referred to support automatically.** Coaches below the mark appear
  as candidates on `/admin/support`; opening a case is a conversation first.
- **The importer never changes a role that already exists.** It creates course
  team members as `EDUCATOR`; its update branch touches only the name, so
  re-running a register can't undo a role somebody set on purpose. The flip side
  is that people created by the early runs — which used `ADMIN` — stay admins
  until something says otherwise. `npm run teams:demote` is that something, and
  `ADMIN_EMAILS` (plus `--keep`) is what stops it taking Admin off a real one.
- **Educators are scoped.** `staffCourseIds(user)` returns `null` for an admin —
  the absence of a filter — and a list of course ids for an educator. Every list
  page here filters by it, and every action calls `assertCourseStaff`.
- **An educator's view is `/educator`, and that is all.** One list: every coach
  assigned to them who still needs something, tagged with which of the three
  jobs it is — watch them deliver, pass or fail them, review the reassessment
  that came back. `getAssessorQueue` builds it from the same two queries the
  grading queue and the support desk used, so the list cannot disagree with the
  write-up pages it links to, and the support half is filtered to `to_review`:
  booking a visit, chasing film and taking somebody's availability are the
  program's jobs and live on `/admin/support`. The dashboard, `/educator/grading`
  and `/educator/support` are redirects to it now.
  The pages under `admin/` are the program's and are an admin's in the
  navigation. They still work and are still scoped — an educator who follows a
  link into one is not stopped — they are simply not offered, and the support
  case page hides the program's own levers (arranging, rearranging, cancelling,
  case settings, closing, granting an extension, recording the film) from
  anybody who isn't an admin.
- **Two attachments, and support needs both.** The roster — `CourseStaff`, what
  `staffCourseIds` resolves — is how a cohort's assessor gets the coaches on it,
  and it stays the only one for deliveries: watching somebody deliver on a
  course is being on that course's team, and there is nothing per-coach to
  assign. A support case is different: it names who is running it
  (`SupportCase.educatorId`), which is an admin handing one coach to one
  assessor, and that assessor is often not on that cohort's team at all. So
  `openCases` matches the roster **or** the assignment, and `assertCaseStaff`
  (not `assertCourseStaff`) guards the case page and every support action.
  Before that, a case assigned to somebody off the roster was invisible on their
  list and redirected them away when they opened it by URL — the assignment did
  nothing.
  `canAccessUpload` follows the same rule for a session plan attached to a
  reassessment: a file the reviewer cannot open is a write-up they cannot do.
- **A coach cannot sign in.** The portal is parked — see the root `CLAUDE.md`.
  Every coach-facing page under here is still correct and still reachable by an
  admin who is enrolled on something; nothing about a coach's *records* changed.
  Don't rebuild a coach page's logic into a staff page on the assumption it is
  dead.
- **A course ends twice.** *Delivered* is derived — the last `CourseDay.date`
  has passed — and moves if the register does, because if a tenth day is added
  delivery finished later. *Closed* is `Course.closedAt`, somebody's judgement
  that the cohort is done, and nothing infers it from a date. Don't collapse the
  two, and don't backfill the second from the first.
- **Closing is never blocked by what's outstanding.** `courseStanding` counts
  the loose ends and the page puts them in front of whoever is closing; a cohort
  legitimately has ends somebody has judged acceptable. Closing files it away —
  it doesn't take a coach's record off them.
- **A support case lapses by the clock, not by a tick.** `stageOf` takes the
  deadline in force and derives "Deadline passed" itself — the stored `LAPSED`
  status records that an educator *decided*, which is a different fact and is
  kept. Before this, a case whose time ran out went on telling the coach their
  educator was arranging an assessment. Nobody was.
- **Work in hand is exempt from that.** A booked session or a delivery sitting
  with an educator for write-up stays on its own stage past the deadline: that
  is the educator's clock to answer for, and calling it lapsed blames the coach
  for somebody else's backlog. Same rule `cda/review.ts` applies to the Unit's
  own overdue response.
- **Cohorts is a row per course; Coaches is a row per enrolment.** They answer
  the two halves of the same question — which cohort still owes something, and
  which coach is short — and neither is a filter of the other. Cohorts replaced
  a per-coach coursework page: all three B Diploma cohorts carry no assignments
  and no quizzes, so it drew eighty-odd rows of "0/0 — no grades" under headline
  figures computed entirely from the two demonstration courses. Don't put
  coursework percentages back on it without checking there is coursework.
- **Never loop a per-coach read over a roster.** `getTasksForCoaches` takes a
  list of user ids and answers in six queries whatever the roster size;
  `getTasksForCoach` is a one-element wrapper on it, so the dashboard and the
  progress page cannot disagree. The progress page used to call the single-coach
  version once per coach — 624 queries for 88 coaches, against 5-32 for every
  other page here. It looked fine locally because SQLite is a function call
  away; production talks to Turso over the network, where round trips are the
  whole cost. If you add a column to that page, add it to the batch.
- **A diploma's coursework belongs to the diploma, not to the cohort.** Two
  session plans on a C Diploma, a journal on a B Diploma, from the catalogue in
  `lib/diploma-coursework.ts` and marked by `Assignment.requirement`.
  `ensureDiplomaCoursework` creates and never edits or deletes, and runs on
  course create, on the settings save that names the qualification, on
  enrolment, on a transfer, in the importer and from `scripts/boot.ts` — which
  is what covers the cohorts imported before any of it existed. Withdraw one
  from a cohort by unpublishing it; delete it and the next boot puts it back.
  The level is read from `Course.qualification`, falling back to the title,
  because the create form has no qualification field.
- **The journal tick and the journal are two different facts.** The register's
  `journalComplete` is an educator's sign-off; the JOURNAL assignment is what
  the coach hands in. Neither sets the other — nothing here is decided
  automatically that a person should decide — and the register shows both
  side by side.
- **Film is a link, never an upload.** Session footage is hundreds of megabytes
  and this app stores files as database rows.

## Loading real course data

```bash
npm run courses:import -- --dry-run   # what would change
npm run courses:import -- --yes       # do it
```

Idempotent — every write is an upsert keyed on something stable. It never
disturbs a transfer, an enrolment window or a make-up recorded since. On a host
with no shell, `B_DIPLOMA_IMPORT_2026=1` arms it for one boot.

Re-extract from the workbooks with
`python3 scripts/extract-b-diploma-2026.py <register.xlsx> [...]`. Addresses are
anonymised there, on purpose.
