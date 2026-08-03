/**
 * Seeds a realistic coaching staff, two courses, and a graded history so the
 * app is usable the moment it starts. Safe to re-run: it clears seeded rows
 * first.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  console.log("Clearing existing data…");
  // Order matters: children before parents, since SQLite enforces the FKs.
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
          title: i === 0 ? "Head Coach" : "Program Admin",
          role: "ADMIN",
        },
      }),
    ),
  );

  const coaches = await Promise.all(
    [
      { email: "marcus.webb@example.com", name: "Marcus Webb", title: "Defensive Coordinator" },
      { email: "tj.rollins@example.com", name: "T.J. Rollins", title: "Offensive Coordinator" },
      { email: "dana.pryor@example.com", name: "Dana Pryor", title: "Linebackers" },
      { email: "elliot.snow@example.com", name: "Elliot Snow", title: "Wide Receivers" },
      { email: "sam.okafor@example.com", name: "Sam Okafor", title: "Offensive Line" },
    ].map((data) => prisma.user.create({ data: { ...data, role: "COACH" } })),
  );

  /* -------------------------------- Courses ------------------------------- */

  const defense = await prisma.course.create({
    data: {
      title: "Base Defense Install",
      season: "2026 Spring",
      description:
        "Cover 3 and Cover 2 rules, run fits, and communication. Every defensive coach installs from the same language.",
      published: true,
      authorId: headCoach.id,
    },
  });

  const staffDev = await prisma.course.create({
    data: {
      title: "Staff Development & Compliance",
      season: "2026 Season",
      description:
        "Practice planning, player safety, and the program standards every coach signs off on before camp.",
      published: true,
      authorId: headCoach.id,
    },
  });

  await prisma.enrollment.createMany({
    data: [
      ...coaches.map((c) => ({ userId: c.id, courseId: defense.id })),
      ...coaches.map((c) => ({ userId: c.id, courseId: staffDev.id })),
    ],
  });

  /* ------------------------------- Materials ------------------------------ */

  await prisma.material.createMany({
    data: [
      {
        courseId: defense.id,
        title: "Cover 3 install — full walkthrough",
        description: "Whiteboard session covering landmarks, pattern match rules, and run fits.",
        kind: "VIDEO",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        position: 0,
      },
      {
        courseId: defense.id,
        title: "Front and coverage call sheet",
        description: "One-page reference. Print it for the practice script binder.",
        kind: "LINK",
        url: "https://example.com/call-sheet",
        position: 1,
      },
      {
        courseId: staffDev.id,
        title: "Practice planning standards",
        description: "Period structure, rep counts, and how we script team periods.",
        kind: "LINK",
        url: "https://example.com/practice-standards",
        position: 0,
      },
    ],
  });

  /* ------------------------------ Assignments ----------------------------- */

  const selfScout = await prisma.assignment.create({
    data: {
      courseId: defense.id,
      title: "Self-scout: 3rd & medium tendencies",
      instructions:
        "Pull our last four games. Chart every 3rd & 4-6 snap: front, coverage, pressure, and result. " +
        "Write up the two tendencies an opponent could sit on, and what you'd call to break them.",
      points: 100,
      dueAt: days(6),
    },
  });

  const installScript = await prisma.assignment.create({
    data: {
      courseId: defense.id,
      title: "Install script — Day 1 individual period",
      instructions:
        "Build the 12-minute individual period for your position group. Include drill names, rep counts, " +
        "and the coaching points tied to this week's install. Attach the script.",
      points: 50,
      dueAt: days(-2),
    },
  });

  const safetyPlan = await prisma.assignment.create({
    data: {
      courseId: staffDev.id,
      title: "Heat and hydration plan for camp",
      instructions:
        "Write your position group's plan for the first three days of camp: water breaks, acclimatization, " +
        "and how you'd handle a player showing early heat-illness signs.",
      points: 50,
      dueAt: days(10),
    },
  });

  /* -------------------------------- Quizzes ------------------------------- */

  const coverageQuiz = await prisma.quiz.create({
    data: {
      courseId: defense.id,
      title: "Cover 3 rules check",
      description: "Ten minutes. Confirms everyone teaches the same rules before we hit the grass.",
      dueAt: days(3),
      maxAttempts: 2,
      questions: {
        create: [
          {
            prompt: "In base Cover 3, who is responsible for the flat to the field?",
            kind: "MULTIPLE_CHOICE",
            points: 2,
            position: 0,
            rationale:
              "The field corner sinks to the deep third, so the field flat belongs to the outside linebacker or nickel.",
            choices: {
              create: [
                { text: "Field corner", isCorrect: false, position: 0 },
                { text: "Nickel / field outside linebacker", isCorrect: true, position: 1 },
                { text: "Free safety", isCorrect: false, position: 2 },
                { text: "Mike linebacker", isCorrect: false, position: 3 },
              ],
            },
          },
          {
            prompt: "Cover 3 gives you an extra defender in the run fit compared to Cover 2.",
            kind: "TRUE_FALSE",
            points: 1,
            position: 1,
            rationale: "The free safety is the extra fitter — that's the whole point of the call.",
            choices: {
              create: [
                { text: "True", isCorrect: true, position: 0 },
                { text: "False", isCorrect: false, position: 1 },
              ],
            },
          },
          {
            prompt:
              "A trips formation to the field puts three vertical threats on your field third. Describe your check and who takes the #3 vertical.",
            kind: "SHORT_ANSWER",
            points: 4,
            position: 2,
            rationale:
              "We want to hear the check called out loud plus a clear answer on #3 — the free safety or the Mike, depending on the call.",
          },
        ],
      },
    },
  });

  await prisma.quiz.create({
    data: {
      courseId: staffDev.id,
      title: "Player safety certification",
      description: "Required before you can run a practice period. Unlimited retakes.",
      dueAt: days(14),
      maxAttempts: null,
      questions: {
        create: [
          {
            prompt:
              "A player takes a hit and is slow getting up, then says he's 'just dinged.' What do you do?",
            kind: "MULTIPLE_CHOICE",
            points: 2,
            position: 0,
            rationale: "Any suspected head injury is a removal. It is never the coach's call to clear.",
            choices: {
              create: [
                { text: "Sit him a series, then let him back in if he says he's fine", isCorrect: false, position: 0 },
                { text: "Remove him from practice and send him to the trainer", isCorrect: true, position: 1 },
                { text: "Ask him to run a lap to see if he's steady", isCorrect: false, position: 2 },
              ],
            },
          },
          {
            prompt: "Full-contact practice time is capped during the regular season.",
            kind: "TRUE_FALSE",
            points: 1,
            position: 1,
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

  // Marcus turned in the install script and got graded.
  await prisma.submission.create({
    data: {
      assignmentId: installScript.id,
      userId: coaches[0].id,
      text: "Individual period attached — 4 min bag work, 4 min block destruction, 4 min tackling circuit.",
      status: "GRADED",
      submittedAt: days(-3),
      score: 46,
      feedback:
        "Good structure and the rep counts are realistic. Tie the block-destruction drill directly to the Cover 3 fit — right now it's a generic drill.",
      gradedAt: days(-1),
      gradedById: headCoach.id,
    },
  });

  // T.J. has a draft going on the self-scout.
  await prisma.submission.create({
    data: {
      assignmentId: selfScout.id,
      userId: coaches[1].id,
      text: "Started charting — through two games so far.",
      status: "DRAFT",
    },
  });

  // Dana turned in the safety plan and is waiting on feedback.
  await prisma.submission.create({
    data: {
      assignmentId: safetyPlan.id,
      userId: coaches[2].id,
      text:
        "Water every 15 minutes for the first three days, helmets-only day one, shells day two. " +
        "Any player showing confusion or cramping comes out and goes to the trainer immediately.",
      status: "SUBMITTED",
      submittedAt: days(-1),
    },
  });

  // Marcus took the coverage quiz — the written answer still needs a read.
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: coverageQuiz.id },
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
          "Check to Cover 3 Buzz. Free safety takes #3 vertical, Mike walls #2 and carries to the hash, " +
          "field corner stays over the top of #1.",
      },
    ],
  });

  console.log("\nSeed complete.\n");
  console.log(`  Admin:   ${adminEmails.join(", ")}`);
  console.log(`  Coaches: ${coaches.map((c) => c.email).join(", ")}`);
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
