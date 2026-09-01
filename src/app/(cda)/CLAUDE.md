# Club Development & Assessment

Everything under `/cda`. Football Queensland rates every club once a year
against a fixed rubric; three assessors score each club independently, the Club
Development Unit reconciles them, and the result is a shield.

`README.md` at the root has the full rubric — domains, weights, thresholds,
shields, the review windows. **Read it before changing any number.** The rubric
is FQ's, published to clubs in an information pack, and is not ours to adjust.

## The shape of it

```
cda/page.tsx        Lands each role where it belongs
cda/club/           A club's own submission: staff register, Non-Negotiables,
                    participation, structure, its rating, its review request
cda/assess/         An assessor's clubs, and the scoring screen
cda/clubs/          A club list for the roles that get one
cda/progress/       How far the cycle has got
cda/cdu/            The Unit: the cycle board, clubs, assessors, pools, the
                    rubric, reconciliation, the audit trail, lock and release
```

## Libraries — `src/lib/cda/`

| | |
|---|---|
| `rubric.ts` | Role weights, points, star thresholds, the fixed rubric. Constants, no logic. |
| `scoring.ts` | **The scoring engine.** Domains, shield, eligibility, agreement. Touches no database. |
| `assessment.ts` | Assembles an assessment; freezes the result at lock. |
| `access.ts` | Club / assessor / CDU authorization. |
| `review.ts` | Review and appeal windows, and what a club is allowed to request. |
| `structure.ts` | The structure standards behind NN7. |
| `club-import.ts` | CSV parsing and the import plan. |

`scoring.ts` takes plain rows and returns plain results, deliberately. That is
what lets the reconciliation screen show what a total *would* be at 2 stars
without writing anything down. **Keep the database out of it.**

## Things that are true here and easy to get wrong

- **The rating is points-based, not an average of domain averages.** Each
  criterion contributes `score × weight`, summed. Averaging the domains gives a
  different and wrong number.
- **A missing thing scores zero rather than being skipped.** A club with no
  Technical Director must rate worse than one with an unqualified one, so absent
  roles and unscored criteria stay in the denominator.
- **Non-Negotiables are a gate, not a score.** They never move the percentage.
  They decide whether a percentage can become a shield. Some are `GATE` and some
  are `SHIELD_THRESHOLD`; the two behave differently.
- **Three independent judgements is the point.** An assessor sees their own
  scores and never the other two's — one visible score anchors the next.
  Don't "helpfully" surface them.
- **A club sees its shield, percentage, four domain scores and Non-Negotiable
  verdicts.** No weights, no thresholds, no criterion-level stars, no assessor
  names. `visibleEvidenceFor` and `portfolioFilter` exist to hold that line.
- **Reading a club's submission and scoring its criteria are different asks.**
  Scoring reach follows the pool; reading the staff register — names, Blue Card
  status, downloadable certificates — stays with the ambassador who works with
  the club through the year.
- **The Unit is `User.cdu`, not `role === "ADMIN"`.** `cdaRole` and `requireCdu`
  both check it. An admin who runs coach education and was never put in the Unit
  belongs nowhere in this directory. Don't reintroduce the shortcut.
- **Nothing is locked or published by a computation.** The portal computes a
  rating live; freezing it is `freezeResult`, called by a person.
- **Platinum is a future level** (85%, from 2028), not stale documentation.

## Loading a real season

```bash
npm run cda:import-2026 -- --dry-run
npm run cda:import-2026 -- --yes
```

`prisma/data/fq-2026.json` is **real Football Queensland data** — 48 clubs, 52
named ambassadors with real addresses, ~2,900 scores. Never paste it into a
reply, publish it, or send it anywhere external.

On a host with no shell, `FQ_IMPORT_2026=1` arms the import for one boot; a row
in `Meta` stops it running twice, and `force` re-runs it after a fix. It runs
beside the web server, never in front of it — see the note in
`scripts/import-season.ts` about the deploy it once killed.

`npm run cda:catalog` seeds the rubric catalogue (additive, safe on every boot).
`npm run cda:seed` adds demo clubs and **must never run against production**.
