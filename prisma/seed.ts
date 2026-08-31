/**
 * Seeds a realistic coaching staff, two courses, and a graded history so the
 * app is usable the moment it starts. Safe to re-run: it clears seeded rows
 * first.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

const prisma = new PrismaClient({ adapter: createAdapter() });

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  console.log("Clearing existing data…");
  // Order matters: children before parents, since SQLite enforces the FKs.
  await prisma.supportRating.deleteMany();
  await prisma.supportAttempt.deleteMany();
  await prisma.supportCase.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.material.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.session.deleteMany();
  await prisma.loginToken.deleteMany();
  await prisma.user.deleteMany();

  /* --------------------------------- Staff -------------------------------- */

  const adminEmails = (process.env.ADMIN_EMAILS ?? "head.coach@example.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const [headCoach] = await Promise.all(
    adminEmails.map((email, i) =>
      prisma.user.create({
        data: {
          email,
          name: i === 0 ? "Ray Delgado" : null,
          title: i === 0 ? "Coach Education Manager" : "Program Admin",
          role: "ADMIN",
        },
      }),
    ),
  );

  const coaches = await Promise.all(
    [
      { email: "marcus.webb@example.com", name: "Marcus Webb", title: "Technical Director" },
      { email: "tj.rollins@example.com", name: "Tom Rollins", title: "Senior Men's Head Coach" },
      { email: "dana.pryor@example.com", name: "Dana Pryor", title: "U15 Girls Head Coach" },
      { email: "elliot.snow@example.com", name: "Elliot Snow", title: "Goalkeeping Coach" },
      { email: "sam.okafor@example.com", name: "Sam Okafor", title: "MiniRoos Coordinator" },
      { email: "priya.raman@example.com", name: "Priya Raman", title: "U13 Boys Head Coach" },
    ].map((data) => prisma.user.create({ data: { ...data, role: "COACH" } })),
  );

  /* -------------------------------- Courses ------------------------------- */

  const principles = await prisma.course.create({
    data: {
      title: "Principles of Play",
      season: "2026 Pre-Season",
      description:
        "Attacking and defending principles, pressing triggers, and building from the back — so every age group is coached in the same language.",
      ratingThreshold: 2.5,
      published: true,
      authorId: headCoach.id,
    },
  });

  const safety = await prisma.course.create({
    data: {
      title: "Player Safety & Club Standards",
      season: "2026 Season",
      description:
        "Heat policy, concussion protocols and the safeguarding standards every coach signs off before the season starts.",
      // Football Australia's line: 2.5 and up is a pass, below it is what the
      // rubric itself calls post-course support.
      ratingThreshold: 2.5,
      published: true,
      authorId: headCoach.id,
    },
  });

  await prisma.enrollment.createMany({
    data: [
      ...coaches.map((c) => ({ userId: c.id, courseId: principles.id })),
      ...coaches.map((c) => ({ userId: c.id, courseId: safety.id })),
    ],
  });

  /* ------------------------------- Materials ------------------------------ */

  await prisma.material.createMany({
    data: [
      {
        courseId: principles.id,
        title: "Pressing triggers — session walkthrough",
        description: "Full session covering the triggers to press, the cues to drop, and how the unit shifts across.",
        kind: "VIDEO",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        position: 0,
      },
      {
        courseId: principles.id,
        title: "Principles of play — one-page reference",
        description: "The attacking and defending principles on a single page. Print it for your session folder.",
        kind: "LINK",
        url: "https://example.com/call-sheet",
        position: 1,
      },
      {
        courseId: safety.id,
        title: "Training and match day standards",
        description: "Session structure, ratios, and the standards expected of coaches on match day.",
        kind: "LINK",
        url: "https://example.com/practice-standards",
        position: 0,
      },
    ],
  });

  /* ------------------------------ Assignments ----------------------------- */

  const matchAnalysis = await prisma.assignment.create({
    data: {
      courseId: principles.id,
      title: "Match analysis: building from the back",
      instructions:
        "Review your last four matches. Chart every goal kick and every restart from your own third: shape, " +
        "first pass, and outcome. Write up the two patterns an opponent could press, and what you would coach " +
        "to beat that press.",
      points: 100,
      dueAt: days(6),
    },
  });

  const sessionPlan = await prisma.assignment.create({
    data: {
      courseId: principles.id,
      title: "Session plan: defending in wide areas",
      instructions:
        "Build a 60-minute session for your age group on defending in wide areas. Include the practice design, " +
        "progressions, and the two or three coaching points you would actually stop play for. Attach the plan.",
      points: 50,
      dueAt: days(-2),
    },
  });

  const safetyPlan = await prisma.assignment.create({
    data: {
      courseId: safety.id,
      title: "Heat and hydration plan for summer training",
      instructions:
        "Write your plan for training through a Queensland summer: drinks breaks, session modifications at each " +
        "heat threshold, and how you would handle a player showing early signs of heat illness.",
      points: 50,
      dueAt: days(10),
    },
  });

  /* -------------------------------- Quizzes ------------------------------- */

  const lawsQuiz = await prisma.quiz.create({
    data: {
      courseId: principles.id,
      title: "Laws of the Game — check",
      description: "Ten minutes. Confirms every coach is teaching the same interpretations before the season.",
      dueAt: days(3),
      maxAttempts: 2,
      questions: {
        create: [
          {
            prompt: "When is a player in an offside position?",
            kind: "MULTIPLE_CHOICE",
            points: 2,
            position: 0,
            rationale:
              "Being level with the second-last opponent is not an offside position, and a player in their own half is never offside.",
            choices: {
              create: [
                { text: "Any time they are ahead of the ball", isCorrect: false, position: 0 },
                {
                  text: "When any part of the head, body or feet is nearer the opponents' goal line than both the ball and the second-last opponent",
                  isCorrect: true,
                  position: 1,
                },
                { text: "Whenever they are inside the opponents' half", isCorrect: false, position: 2 },
                { text: "When they are level with the second-last opponent", isCorrect: false, position: 3 },
              ],
            },
          },
          {
            prompt: "A player can be penalised for offside directly from a corner kick.",
            kind: "TRUE_FALSE",
            points: 1,
            position: 1,
            rationale:
              "There is no offside offence directly from a corner kick, a throw-in or a goal kick.",
            choices: {
              create: [
                { text: "True", isCorrect: false, position: 0 },
                { text: "False", isCorrect: true, position: 1 },
              ],
            },
          },
          {
            prompt:
              "Your side keeps conceding from switches of play after losing the ball in midfield. Describe the rest-defence shape you would coach, and who is responsible for the far-side space.",
            kind: "SHORT_ANSWER",
            points: 4,
            position: 2,
            rationale:
              "We are looking for a clear rest-defence structure while in possession, plus an explicit answer on who covers the far side when the ball is switched.",
          },
        ],
      },
    },
  });

  const safetyQuiz = await prisma.quiz.create({
    data: {
      courseId: safety.id,
      title: "Player safety certification",
      description: "Required before you take a session this season. Unlimited retakes.",
      dueAt: days(14),
      maxAttempts: null,
      questions: {
        create: [
          {
            prompt:
              "A player takes a knock to the head, is slow to get up, and tells you they are fine to keep playing. What do you do?",
            kind: "MULTIPLE_CHOICE",
            points: 2,
            position: 0,
            rationale:
              "Any suspected concussion means immediate and permanent removal for that day — if in doubt, sit them out. Clearing a player is never the coach's call.",
            choices: {
              create: [
                { text: "Rest them for ten minutes, then bring them back on if they seem alright", isCorrect: false, position: 0 },
                {
                  text: "Remove them from play for the rest of the day and follow the concussion protocol",
                  isCorrect: true,
                  position: 1,
                },
                { text: "Ask them to jog the touchline to see whether their balance is steady", isCorrect: false, position: 2 },
              ],
            },
          },
          {
            prompt:
              "Training must be modified or postponed once the heat policy threshold is reached.",
            kind: "TRUE_FALSE",
            points: 1,
            position: 1,
            rationale:
              "Queensland summers push past the threshold regularly. Modifying or postponing is a requirement, not a judgement call.",
            choices: {
              create: [
                { text: "True", isCorrect: true, position: 0 },
                { text: "False", isCorrect: false, position: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  /* --------------------- A little history to look at ---------------------- */

  // Marcus turned in the session plan and it has been graded.
  await prisma.submission.create({
    data: {
      assignmentId: sessionPlan.id,
      userId: coaches[0].id,
      text:
        "Plan attached — 15 min rondo warm-up, 20 min 4v4 wide overloads, 25 min 9v9 with a halfway line condition.",
      status: "GRADED",
      submittedAt: days(-3),
      score: 46,
      feedback:
        "Good structure, and the practice design genuinely creates the picture you want. Tie the 4v4 back to the pressing triggers from the course — at the moment it could be any wide-area session.",
      gradedAt: days(-1),
      gradedById: headCoach.id,
    },
  });

  // Tom has a draft going on the match analysis.
  await prisma.submission.create({
    data: {
      assignmentId: matchAnalysis.id,
      userId: coaches[1].id,
      text: "Started charting — two matches done, two to go.",
      status: "DRAFT",
    },
  });

  // Dana turned in the safety plan and is waiting on feedback.
  await prisma.submission.create({
    data: {
      assignmentId: safetyPlan.id,
      userId: coaches[2].id,
      text:
        "Drinks break every 15 minutes once we pass 28 degrees, session cut to 45 minutes above 32, and " +
        "moved to an evening slot in February. Any player showing confusion or cramping comes off immediately " +
        "and is not left on their own.",
      status: "SUBMITTED",
      submittedAt: days(-1),
    },
  });

  // Marcus sat the Laws quiz — the written answer still needs a read.
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: lawsQuiz.id },
    include: { questions: { include: { choices: true }, orderBy: { position: "asc" } } },
  });

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId: coaches[0].id,
      attemptNo: 1,
      status: "AWAITING_REVIEW",
      submittedAt: days(-1),
      score: 3,
      maxScore: quiz.questions.reduce((sum, q) => sum + q.points, 0),
    },
  });

  await prisma.answer.createMany({
    data: [
      {
        attemptId: attempt.id,
        questionId: quiz.questions[0].id,
        choiceId: quiz.questions[0].choices.find((c) => c.isCorrect)!.id,
        isCorrect: true,
        pointsAwarded: 2,
      },
      {
        attemptId: attempt.id,
        questionId: quiz.questions[1].id,
        choiceId: quiz.questions[1].choices.find((c) => c.isCorrect)!.id,
        isCorrect: true,
        pointsAwarded: 1,
      },
      {
        attemptId: attempt.id,
        questionId: quiz.questions[2].id,
        text:
          "Rest defence in a 2-3 shape while we build: two centre-backs holding, the single pivot screening in " +
          "front, and the far full-back tucking in to cover the switch. Nearest winger recovers inside.",
      },
    ],
  });

  /* --------------------- Post-course support ------------------------------ */

  // Four coaches finish Player Safety & Club Standards below its 70% pass mark.
  // Coursework alone hasn't shown they can run a safe session, so each is a
  // candidate for reassessment on a delivery — live, or on film.

  const safetyQuestions = await prisma.question.findMany({
    where: { quizId: safetyQuiz.id },
    include: { choices: true },
    orderBy: { position: "asc" },
  });
  const safetyMax = safetyQuestions.reduce((sum, q) => sum + q.points, 0);

  /**
   * Finishes the safety course for one coach: coursework graded, and the
   * register's own rating recorded against their enrolment.
   */
  async function finishSafetyCourse(
    userId: string,
    assignmentScore: number,
    rating: number,
    response: string,
  ) {
    await prisma.enrollment.update({
      where: { userId_courseId: { userId, courseId: safety.id } },
      data: {
        rating,
        outcome: rating >= 2.5 ? "PASSED" : "POST_COURSE_SUPPORT",
        attendanceMet: true,
        journalComplete: true,
      },
    });

    await prisma.submission.create({
      data: {
        assignmentId: safetyPlan.id,
        userId,
        text: response,
        status: "GRADED",
        submittedAt: days(-9),
        score: assignmentScore,
        feedback:
          "The thresholds are right, but I can't see what you'd actually change on the session " +
          "itself. That's the part I want to watch you do.",
        gradedAt: days(-7),
        gradedById: headCoach.id,
      },
    });

    const certification = await prisma.quizAttempt.create({
      data: {
        quizId: safetyQuiz.id,
        userId,
        attemptNo: 1,
        status: "GRADED",
        submittedAt: days(-9),
        score: 2,
        maxScore: safetyMax,
        gradedAt: days(-9),
        gradedById: headCoach.id,
      },
    });

    await prisma.answer.createMany({
      data: safetyQuestions.map((question, index) => {
        const correct = question.choices.find((c) => c.isCorrect)!;
        // Right on the concussion question, wrong on the heat policy.
        const chosen = index === 0 ? correct : question.choices.find((c) => !c.isCorrect)!;
        return {
          attemptId: certification.id,
          questionId: question.id,
          choiceId: chosen.id,
          isCorrect: chosen.isCorrect,
          pointsAwarded: chosen.isCorrect ? question.points : 0,
        };
      }),
    });
  }

  const [, tom, , elliot, sam, priya] = coaches;

  await finishSafetyCourse(
    elliot.id,
    28,
    1.5,
    "Drinks every 20 minutes, and we stop if anyone looks like they're struggling.",
  );
  await finishSafetyCourse(
    sam.id,
    30,
    2,
    "Two breaks a session in summer, and parents are told to send a full bottle.",
  );
  await finishSafetyCourse(
    tom.id,
    33,
    2,
    "Breaks on the quarter, session shortened above 32, and nobody goes back on after a head knock.",
  );
  await finishSafetyCourse(
    priya.id,
    31,
    2,
    "Water breaks every 15 minutes and we move to the shaded pitch when it's over 30.",
  );

  const ALL_CRITERIA = [
    "ENGAGEMENT",
    "OBJECTIVE",
    "CONTENT",
    "ORGANISATION",
    "PRESENTING",
    "COACHING",
    "ENVIRONMENT",
  ] as const;

  /** Rates every criterion at `base`, then applies the exceptions given. */
  function marks(base: number, exceptions: Partial<Record<(typeof ALL_CRITERIA)[number], number>> = {}) {
    return ALL_CRITERIA.map((code) => ({ code, rating: exceptions[code] ?? base }));
  }

  /** The overall figure the app computes from a set of marks. */
  function overall(rated: { rating: number }[]) {
    const mean = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length;
    return Math.round(mean * 2) / 2;
  }

  // Elliot filmed a session and it's sitting in the educator's queue.
  await prisma.supportCase.create({
    data: {
      courseId: safety.id,
      userId: elliot.id,
      reason:
        "Strong on the protocols in writing, but the heat question went the wrong way and none of " +
        "it showed up in the plan. I want to see how you actually run a session in the heat.",
      referredRating: 1.5,
      educatorId: headCoach.id,
      referredById: headCoach.id,
      openedAt: days(-6),
      attempts: {
        create: {
          attemptNo: 1,
          pathway: "VIDEO_REVIEW",
          status: "SUBMITTED",
          dueAt: days(-1),
          submittedAt: days(-2),
          videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          coachNotes:
            "U14 boys, 16 players, 31 degrees at kick-off. Theme is pressing from the front. " +
            "Breaks at 15 and 35 minutes — you'll see me pull the session in at the second one.",
        },
      },
    },
  });

  // Sam has an educator coming out next week.
  await prisma.supportCase.create({
    data: {
      courseId: safety.id,
      userId: sam.id,
      reason:
        "MiniRoos numbers make ratios the thing to get right, and the written plan doesn't say " +
        "how you'd split the group. Easier to watch than to write about.",
      referredRating: 2,
      educatorId: headCoach.id,
      referredById: headCoach.id,
      openedAt: days(-4),
      attempts: {
        create: {
          attemptNo: 1,
          pathway: "LIVE_ASSESSMENT",
          status: "SCHEDULED",
          dueAt: days(5),
          venue: "Wolter Park, field 3",
        },
      },
    },
  });

  // Tom went round twice: film that fell short, then an observation that didn't.
  const tomCase = await prisma.supportCase.create({
    data: {
      courseId: safety.id,
      userId: tom.id,
      status: "SUCCESSFUL",
      reason:
        "Sixty-six per cent, and the gap is all in the practical. Let's see a session rather than " +
        "re-sit the paper.",
      referredRating: 2,
      educatorId: headCoach.id,
      referredById: headCoach.id,
      openedAt: days(-40),
      closedAt: days(-8),
    },
  });

  const firstMarks = marks(2.5, { ENVIRONMENT: 1.5, COACHING: 1.5, ORGANISATION: 2 });
  const secondMarks = marks(3, { ENGAGEMENT: 3.5, COACHING: 3.5 });

  await prisma.supportAttempt.create({
    data: {
      caseId: tomCase.id,
      attemptNo: 1,
      pathway: "VIDEO_REVIEW",
      status: "REVIEWED",
      dueAt: days(-30),
      submittedAt: days(-31),
      videoUrl: "https://vimeo.com/76979871",
      coachNotes: "Senior men, 18 players, full pitch. Theme is rest defence.",
      outcome: "NOT_YET_SUCCESSFUL",
      feedback:
        "The content is right and the players are with you. Two things stopped this: the session " +
        "ran for 22 minutes before the first drinks break on a 33-degree evening, and you stopped " +
        "play nine times in the middle practice — by the sixth the players had stopped listening. " +
        "Fix the breaks, pick two coaching points and let the rest go.",
      reviewedAt: days(-28),
      reviewedById: headCoach.id,
      rating: overall(firstMarks),
      ratings: {
        create: firstMarks.map((m) => ({
          ...m,
          comment:
            m.code === "ENVIRONMENT"
              ? "22 minutes to the first break at 33 degrees."
              : m.code === "COACHING"
                ? "Nine stoppages in one practice."
                : null,
        })),
      },
    },
  });

  await prisma.supportAttempt.create({
    data: {
      caseId: tomCase.id,
      attemptNo: 2,
      pathway: "LIVE_ASSESSMENT",
      status: "REVIEWED",
      dueAt: days(-10),
      submittedAt: days(-10),
      venue: "Meakin Park, field 1",
      outcome: "SUCCESSFUL",
      feedback:
        "Different session. Breaks on the quarter without being asked, three stoppages across the " +
        "whole hour, and the one on the far-side cover was exactly the right moment. That's the " +
        "standard — well done.",
      reviewedAt: days(-8),
      reviewedById: headCoach.id,
      rating: overall(secondMarks),
      ratings: { create: secondMarks },
    },
  });

  console.log("\nSeed complete.\n");
  console.log(`  Admin:   ${adminEmails.join(", ")}`);
  console.log(`  Coaches: ${coaches.map((c) => c.email).join(", ")}`);
  console.log(
    "\n  Post-course support: Elliot Snow's video is waiting on review, Sam Okafor has a live",
  );
  console.log(
    "  assessment booked, Tom Rollins passed on his second attempt, and Priya Raman finished",
  );
  console.log("  below the pass mark with no case open yet.");
  console.log("\nSign in at http://localhost:3000/login with any of those addresses.");
  console.log("Without SMTP configured, the link is printed to the server console");
  console.log("and shown right on the login page in development.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
