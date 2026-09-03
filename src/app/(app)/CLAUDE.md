# Coach Education

Everything under `/dashboard`. FQ runs AFC/Football Australia diplomas off one
spreadsheet per course; this is that spreadsheet, plus the coursework around it.

`README.md` at the root carries the rubric, the scoring and the roles. Read it
before changing anything about how a coach is rated.

## The shape of it

```
dashboard/          Coach home; also carries the staff queues and banners
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
  make-ups/         The hours desk — debts that follow a coach across courses
  progress/         Coursework completion (the online courses' measure)
  people/           Accounts and roles (ADMIN only)
  actions/          Every server action for the above
```

## Libraries

| | |
|---|---|
| `lib/attendance.ts` | Pure hours. Day lengths, totals, debts, enrolment windows. No database. |
| `lib/support-rubric.ts` | FA's rubric: 7 criteria, 1–5 in half steps, bands, verdicts. Client-safe. |
| `lib/support.ts` | Support-case queries. `server-only`. |
| `lib/coaches.ts` | The cross-course roster: one row per enrolment. `server-only`. |
| `lib/coursework.ts` | Task aggregation and progress summaries. |
| `lib/grading.ts` | Auto-grading and score rollups. |

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
- **A rating decides an outcome, and the action enforces it.** Below the
  threshold cannot be "Passed"; the form won't offer it and `saveResults`
  refuses it. An educator who means to pass somebody short has to move the
  marks and own it.
- **Nobody is referred to support automatically.** Coaches below the mark appear
  as candidates on `/admin/support`; opening a case is a conversation first.
- **Educators are scoped.** `staffCourseIds(user)` returns `null` for an admin —
  the absence of a filter — and a list of course ids for an educator. Every list
  page here filters by it, and every action calls `assertCourseStaff`.
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
