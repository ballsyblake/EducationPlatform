"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { createInviteLink, normalizeEmail } from "@/lib/auth";
import { ASSESSOR_POOL_WHERE, RELEASED_STATUSES, mayAssess, requireCdu } from "@/lib/cda/access";
import {
  activeCycle,
  ensureAssessment,
  freezeResult,
  loadAssessment,
  tierScope,
} from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS, MAX_ASSESSORS_PER_CLUB } from "@/lib/cda/rubric";
import { STAGE_LABELS, reviewTimeline } from "@/lib/cda/review";
import { THRESHOLD_LEVELS } from "@/lib/cda/scoring";
import { ensureCycleStandards } from "@/lib/cda/assessment";
import { parseClubCsv, planImport, type ImportPlan } from "@/lib/cda/club-import";
import { prisma } from "@/lib/db";

export type CduFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  invite?: { url: string; qrSvg: string; email: string; expiresAt: string };
};

async function buildInvite(userId: string, email: string) {
  const { url, expiresAt } = await createInviteLink(userId);
  return {
    url,
    qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, width: 180 }),
    email,
    expiresAt: expiresAt.toISOString(),
  };
}

function refresh() {
  revalidatePath("/cda/cdu", "layout");
}

/* -------------------------------------------------------------------------- */
/* Clubs                                                                      */
/* -------------------------------------------------------------------------- */

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const clubSchema = z.object({
  name: z.string().trim().min(3, "Enter the club's name."),
  zone: z.string().trim().max(80),
  tier: z.string().trim().max(40),
  contactName: z.string().trim().max(120),
  contactEmail: z.string().trim().email("Enter a valid contact email.").or(z.literal("")),
});

export async function saveClub(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const parsed = clubSchema.safeParse({
    name: formData.get("name") ?? "",
    zone: formData.get("zone") ?? "",
    tier: formData.get("tier") ?? "",
    contactName: formData.get("contactName") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const data = {
    name: parsed.data.name,
    zone: parsed.data.zone || null,
    tier: parsed.data.tier || null,
    contactName: parsed.data.contactName || null,
    contactEmail: parsed.data.contactEmail || null,
  };

  // The assessment tier decides which line items apply, so it is set alongside
  // the club rather than left to default. An empty value means "not set", which
  // falls back to the first tier at scoring time. A *missing* field means the
  // form didn't offer the control at all, and must leave the tier alone rather
  // than silently clearing something somebody chose deliberately.
  const tierGiven = formData.has("assessmentTierId");
  const assessmentTierId = String(formData.get("assessmentTierId") ?? "") || null;
  const withTier = tierGiven ? { ...data, tierId: assessmentTierId } : data;

  const clubId = String(formData.get("clubId") ?? "");

  if (clubId) {
    await prisma.club.update({ where: { id: clubId }, data: withTier });
    // An assessment already open for this club follows the change, so a tier
    // corrected mid-cycle actually reaches the season it applies to.
    const open = await activeCycle();
    if (tierGiven && open) {
      await prisma.clubAssessment.updateMany({
        where: { clubId, cycleId: open.id, lockedAt: null },
        data: { tierId: assessmentTierId },
      });
    }
    refresh();
    return { status: "ok", message: `${data.name} updated.` };
  }

  // The slug is only ever derived here. Two clubs with the same name in
  // different zones is a real thing in Queensland football, so collisions are
  // resolved rather than rejected.
  let slug = slugify(data.name);
  for (let n = 2; await prisma.club.findUnique({ where: { slug } }); n += 1) {
    slug = `${slugify(data.name)}-${n}`;
  }

  const club = await prisma.club.create({ data: { ...withTier, slug } });

  // Bring the new club into the open cycle straight away, so it appears on the
  // CDU's board and can start entering data without a second step.
  const cycle = await activeCycle();
  if (cycle) await ensureAssessment(club.id, cycle.id);

  refresh();
  return { status: "ok", message: `${club.name} added.` };
}

export async function setClubActive(formData: FormData) {
  await requireCdu();
  const clubId = String(formData.get("clubId") ?? "");
  const active = formData.get("active") === "true";
  await prisma.club.update({ where: { id: clubId }, data: { active } });
  refresh();
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Creates a portal account and returns a sign-in link to hand over.
 *
 * Same model as the coach-education side: no passwords, an admin creates the
 * account, and the link is delivered by hand. For a club administrator the
 * account is linked to the club in the same step — an unlinked CLUB account can
 * see nothing at all, so leaving that to a second action just creates a state
 * where someone has an account that does nothing.
 */
export async function addPortalUser(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") === "ASSESSOR" ? "ASSESSOR" : "CLUB";
  const clubId = String(formData.get("clubId") ?? "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (role === "CLUB" && !clubId) {
    return { status: "error", message: "Choose the club this administrator belongs to." };
  }

  // "Already has an account" on its own is a dead end: it is true, gives no
  // clue which account, and leaves the operator with nothing to do. Every
  // branch below either completes the job or names the conflict and the way
  // out.
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { clubMemberships: { include: { club: { select: { id: true, name: true } } } } },
  });

  if (existing) {
    const label = role === "ASSESSOR" ? "assessor" : "club administrator";

    if (existing.role === role) {
      // Re-adding somebody we deactivated is the ordinary way this happens: an
      // assessor sits out a season and comes back. Reactivating is plainly what
      // "add this assessor" means, so do it rather than reporting a clash with
      // a record the operator can't see from here.
      if (!existing.active) {
        const club = existing.clubMemberships[0]?.club;
        if (role === "CLUB" && club && club.id !== clubId) {
          return {
            status: "error",
            message: `${email} is a deactivated administrator for ${club.name}. Reactivate them from that club rather than adding them here.`,
          };
        }

        const revived = await prisma.user.update({
          where: { id: existing.id },
          data: {
            active: true,
            ...(name ? { name } : {}),
            ...(title ? { title } : {}),
            ...(role === "CLUB" && existing.clubMemberships.length === 0
              ? { clubMemberships: { create: { clubId } } }
              : {}),
          },
        });
        refresh();
        return {
          status: "ok",
          message: `${email} was a deactivated ${label} — reactivated.`,
          invite: await buildInvite(revived.id, email),
        };
      }

      const where =
        role === "ASSESSOR"
          ? "in the list on this page"
          : `on ${existing.clubMemberships[0]?.club.name ?? "their club"}`;
      return {
        status: "error",
        message: `${email} is already an active ${label}, ${where}. Use the sign-in link button on their row to issue a new link.`,
      };
    }

    if (existing.role === "ADMIN") {
      if (role !== "ASSESSOR") {
        return {
          status: "error",
          message: `${email} is a Club Development Unit account. Administering the cycle and administering a club are different jobs — use a different address.`,
        };
      }

      // The Unit's own people assess too. Rather than a second account under a
      // second address — which splits one person's work across two identities
      // and makes the record harder to read — the existing account joins the
      // assessor pool. No sign-in link: they already have a way in.
      if (existing.assesses) {
        return {
          status: "error",
          message: `${email} is already in the assessor pool, in the list on this page.`,
        };
      }

      await prisma.user.update({
        where: { id: existing.id },
        data: { assesses: true, ...(title ? { title } : {}) },
      });
      refresh();
      return {
        status: "ok",
        message: `${email} is a Club Development Unit account and has been added to the assessor pool. They sign in as they already do — allocate them line items from a pool's page.`,
      };
    }

    if (existing.role === "CLUB") {
      const club = existing.clubMemberships[0]?.club.name;
      return {
        status: "error",
        message: `${email} administers ${club ?? "a club"}. The same account can't also score clubs — use a different address.`,
      };
    }

    return {
      status: "error",
      message: `${email} is a coach-education account. Making it a portal account would take away their course access — use a different address.`,
    };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      title: title ?? (role === "ASSESSOR" ? "FQ Assessor" : "Club Administrator"),
      role,
      ...(role === "CLUB" ? { clubMemberships: { create: { clubId } } } : {}),
    },
  });

  refresh();
  return {
    status: "ok",
    message: `${email} added.`,
    invite: await buildInvite(user.id, email),
  };
}

export async function issueSignInLink(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    return { status: "error", message: "That account is inactive." };
  }
  // Clubs, assessors, and Club Development Unit accounts that are in the
  // assessor pool — which is to say exactly the accounts the pages that offer
  // this button actually list.
  //
  // It used to exclude every ADMIN, reasoning that they already have a way in.
  // That is only true of an admin who is already signed in on the device in
  // front of them: a CDU colleague added to the pool and never signed in had no
  // way to be given a link from the one page that lists them.
  //
  // An ADMIN not in the pool still gets nothing, and nothing is granted that
  // the caller lacks — issuing this needs requireCdu(), so an admin is minting
  // a link for an admin.
  if (user.role !== "CLUB" && !mayAssess(user)) {
    return { status: "error", message: "That account isn't a portal account." };
  }

  return {
    status: "ok",
    message: `Sign-in link for ${user.email}.`,
    invite: await buildInvite(user.id, user.email),
  };
}

export async function setUserActive(formData: FormData) {
  await requireCdu();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";

  await prisma.user.updateMany({
    where: { id: userId, role: { in: ["CLUB", "ASSESSOR"] } },
    data: { active },
  });

  if (!active) {
    // Deactivation has to take effect now, not whenever their session lapses.
    await prisma.session.deleteMany({ where: { userId } });
  }

  refresh();
}

/**
 * Takes a Club Development Unit account back out of the assessor pool.
 *
 * Deliberately not "deactivate": their CDU account is how they run the cycle,
 * and the assessors page has no business switching that off. This only ends
 * their standing to hold line items.
 *
 * Refused while they still hold any, because clearing the flag wouldn't remove
 * the allocations — it would leave line items assigned to somebody the pool
 * page no longer offers, which is a worse state than the one being fixed. The
 * allocations come off from the pool's page, where the consequence (their
 * scores on that item go too) is stated.
 */
export async function setAssesses(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const userId = String(formData.get("userId") ?? "");
  const assesses = formData.get("assesses") === "true";

  const user = await prisma.user.findFirst({ where: { id: userId, role: "ADMIN" } });
  if (!user) return { status: "error", message: "That isn't a Club Development Unit account." };

  if (!assesses) {
    const held = await prisma.criterionAssignment.count({ where: { assessorId: userId } });
    if (held > 0) {
      return {
        status: "error",
        message: `${user.email} still holds ${held} line item${held === 1 ? "" : "s"}. Unassign them from the pool's page first — that decides what happens to the scores they gave.`,
      };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { assesses } });
  refresh();
  return {
    status: "ok",
    message: assesses
      ? `${user.email} added to the assessor pool.`
      : `${user.email} removed from the assessor pool. Their Club Development Unit account is untouched.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Ambassador portfolios                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sets which CDAs look after a club through the year.
 *
 * Standing, not per cycle: a Club Development Ambassador visits and supports
 * these clubs whether or not a rating is running. It is also what an assessor
 * can see — they reach a club only where their portfolio and their line-item
 * allocation overlap — so this is the control that decides who reads a club's
 * evidence, and it belongs with the club rather than buried in a cycle.
 */
export async function setClubAmbassadors(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const clubId = String(formData.get("clubId") ?? "");
  if (!clubId) return { status: "error", message: "No club given." };

  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } });
  if (!club) return { status: "error", message: "That club no longer exists." };

  const wanted = formData.getAll("ambassadorId").map(String).filter(Boolean);

  // Only people who can actually hold a line item. A club administrator or a
  // coach in this list would be a portfolio that grants nothing and confuses
  // the pool page's coverage warning.
  const eligible = await prisma.user.findMany({
    where: { id: { in: wanted }, ...ASSESSOR_POOL_WHERE, active: true },
    select: { id: true },
  });
  const ids = eligible.map((u) => u.id);

  await prisma.$transaction([
    prisma.clubAmbassador.deleteMany({ where: { clubId, userId: { notIn: ids } } }),
    ...ids.map((userId) =>
      prisma.clubAmbassador.upsert({
        where: { clubId_userId: { clubId, userId } },
        update: {},
        create: { clubId, userId },
      }),
    ),
  ]);

  refresh();
  return {
    status: "ok",
    message:
      ids.length === 0
        ? `${club.name} has no CDA. Nobody can assess it until one is assigned.`
        : `${club.name}: ${ids.length} CDA${ids.length === 1 ? "" : "s"}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Assessor assignment                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Allocates one line item, across one pool, to one assessor.
 *
 * Slots 1 and 2 assess independently. Slot 3 exists only to break a split
 * between them and is normally left empty — filling it as a matter of course
 * turns a tiebreaker into a third opinion and costs a third of the assessing
 * effort for nothing.
 */
export async function assignCriterion(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const poolId = String(formData.get("poolId") ?? "");
  const criterionId = String(formData.get("criterionId") ?? "");
  const assessorId = String(formData.get("assessorId") ?? "");
  const slot = Number(formData.get("slot") ?? 1);

  if (!assessorId) return { status: "error", message: "Choose an assessor." };
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_ASSESSORS_PER_CLUB) {
    return { status: "error", message: `Slot must be 1 to ${MAX_ASSESSORS_PER_CLUB}.` };
  }

  const assessor = await prisma.user.findFirst({
    where: { id: assessorId, ...ASSESSOR_POOL_WHERE, active: true },
  });
  if (!assessor) return { status: "error", message: "That assessor isn't available." };

  const existing = await prisma.criterionAssignment.findUnique({
    where: { poolId_criterionId_slot: { poolId, criterionId, slot } },
  });
  if (existing) {
    return { status: "error", message: `Slot ${slot} is already filled for this line item.` };
  }

  try {
    await prisma.criterionAssignment.create({ data: { poolId, criterionId, assessorId, slot } });
  } catch {
    // The second unique index catches the same person in two slots.
    return { status: "error", message: "That assessor already holds this line item." };
  }

  refresh();
  return { status: "ok", message: `${assessor.name ?? assessor.email} assigned to slot ${slot}.` };
}

/** How many independent assessors a line item wants before it is covered. */
const SLOTS_WANTED = 2;

/**
 * Fills every unallocated line item in a pool, spreading the work evenly.
 *
 * FQ's own matrix names an assessor for 38 of the 54 items; the rest — the
 * observation items and the outcome metrics — it settles centrally and never
 * allocated. Importing that faithfully left those items with nobody holding
 * them, and doing anything about it one dropdown at a time is a hundred-odd
 * selections across three pools.
 *
 * Two slots per item, not three: slots 1 and 2 assess independently, and slot 3
 * exists only to break a split between them. Offering a third up front invites
 * an opinion nobody has asked for yet.
 *
 * Who gets what is decided by load — fewest items held in this pool first, then
 * fewest overall, then by name so a re-run is not a lottery. That is what
 * spreading a pool evenly means when nothing else distinguishes the candidates,
 * and it is deliberately not a judgement about who is suited to an item. The
 * Unit can see every assignment on this page and take any of them back; this
 * fills the gaps so there is something to adjust rather than a blank sheet.
 */
async function fillPoolGaps(poolId: string): Promise<
  { ok: true; filled: number; people: Set<string> } | { ok: false; message: string }
> {
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: { assessments: { select: { id: true, tierId: true } } },
  });
  if (!pool) return { ok: false, message: "That pool no longer exists." };

  const [criteria, assignments, assessors] = await Promise.all([
    prisma.criterion.findMany({
      where: { active: true, domain: { in: [...ASSESSED_DOMAINS] } },
      select: { id: true, code: true },
      orderBy: { position: "asc" },
    }),
    prisma.criterionAssignment.findMany({
      where: { pool: { cycleId: pool.cycleId } },
      select: { id: true, poolId: true, criterionId: true, assessorId: true, slot: true },
    }),
    prisma.user.findMany({
      where: { ...ASSESSOR_POOL_WHERE, active: true },
      select: { id: true, name: true, email: true },
    }),
  ]);

  if (assessors.length === 0) {
    return { ok: false, message: "There are no active assessors to allocate to." };
  }

  // Only what this pool's clubs are actually assessed on. Allocating an item to
  // a pool of Tier 2 clubs that are never scored on it books somebody's time
  // for work the rating would discard.
  const applies = await tierScope(
    pool.assessments,
    criteria.map((c) => c.id),
  );
  const applicable = criteria.filter((c) => pool.assessments.some((a) => applies(c.id, a.id)));

  // Load is counted across the whole cycle, not just this pool: an assessor
  // carrying thirty items in Pool A is not a free pair of hands for Pool B.
  const loadAll = new Map<string, number>();
  const loadHere = new Map<string, number>();
  for (const a of assignments) {
    loadAll.set(a.assessorId, (loadAll.get(a.assessorId) ?? 0) + 1);
    if (a.poolId === poolId) loadHere.set(a.assessorId, (loadHere.get(a.assessorId) ?? 0) + 1);
  }

  const created: { criterionId: string; assessorId: string; slot: number }[] = [];
  let filled = 0;

  for (const c of applicable) {
    const held = assignments.filter((a) => a.poolId === poolId && a.criterionId === c.id);

    // Only items nobody holds. An item already down to one assessor has no
    // independent second opinion and arguably wants a partner, but that is a
    // change to an allocation somebody made on purpose — a different act from
    // filling a blank, and not what a button labelled "allocate the rest"
    // should quietly do. The row's own dropdown adds a second assessor.
    if (held.length > 0) continue;

    const taken = new Set<string>();
    const usedSlots = new Set<number>();

    for (let slot = 1; slot <= SLOTS_WANTED; slot += 1) {
      if (usedSlots.has(slot)) continue;

      const next = assessors
        .filter((a) => !taken.has(a.id))
        .sort(
          (x, y) =>
            (loadHere.get(x.id) ?? 0) - (loadHere.get(y.id) ?? 0) ||
            (loadAll.get(x.id) ?? 0) - (loadAll.get(y.id) ?? 0) ||
            (x.name ?? x.email).localeCompare(y.name ?? y.email),
        )[0];
      // Fewer assessors than slots is a real state, not an error: one person
      // covering an item alone is worse than two, and better than nobody.
      if (!next) break;

      created.push({ criterionId: c.id, assessorId: next.id, slot });
      taken.add(next.id);
      usedSlots.add(slot);
      loadHere.set(next.id, (loadHere.get(next.id) ?? 0) + 1);
      loadAll.set(next.id, (loadAll.get(next.id) ?? 0) + 1);
      filled += 1;
    }
  }

  if (created.length > 0) {
    await prisma.criterionAssignment.createMany({
      data: created.map((c) => ({ ...c, poolId })),
    });
  }

  return { ok: true, filled, people: new Set(created.map((c) => c.assessorId)) };
}

/** Fills one pool, from that pool's page. */
export async function allocateRemaining(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const result = await fillPoolGaps(String(formData.get("poolId") ?? ""));
  if (!result.ok) return { status: "error", message: result.message };

  if (result.filled === 0) {
    return { status: "ok", message: "Every line item in this pool already has its assessors." };
  }

  refresh();
  const n = result.people.size;
  return {
    status: "ok",
    message: `Filled ${result.filled} slot${result.filled === 1 ? "" : "s"} across ${n} assessor${n === 1 ? "" : "s"}. Adjust or remove any of them below.`,
  };
}

/**
 * Fills every pool in the open cycle, from the Cycle page.
 *
 * Pool by pool rather than in one pass, and reading the assignments fresh each
 * time, so the load each pool adds is visible to the next one. Doing all five
 * against a single snapshot would hand the same few least-loaded people the
 * first slot in every pool and undo the balancing.
 */
export async function allocateEveryPool(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const cycleId = String(formData.get("cycleId") ?? "");

  const pools = await prisma.pool.findMany({
    where: { cycleId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  if (pools.length === 0) return { status: "error", message: "This cycle has no pools yet." };

  let filled = 0;
  const people = new Set<string>();
  const touched: string[] = [];

  for (const pool of pools) {
    const result = await fillPoolGaps(pool.id);
    if (!result.ok) return { status: "error", message: result.message };
    if (result.filled === 0) continue;
    filled += result.filled;
    for (const id of result.people) people.add(id);
    touched.push(pool.name);
  }

  if (filled === 0) {
    return { status: "ok", message: "Every line item in every pool already has its assessors." };
  }

  refresh();
  return {
    status: "ok",
    message: `Filled ${filled} slot${filled === 1 ? "" : "s"} across ${people.size} assessor${people.size === 1 ? "" : "s"}, in pool${touched.length === 1 ? "" : "s"} ${touched.join(", ")}. Open a pool to adjust or remove any of them.`,
  };
}

/**
 * Removes a line item from an assessor.
 *
 * Their scores for it go too, across every club in the pool. Leaving them
 * behind would mean the reconciliation view showing a column headed by someone
 * who no longer holds the item, with those scores still counting towards the
 * median.
 */
export async function unassignCriterion(formData: FormData) {
  await requireCdu();
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    select: { poolId: true, criterionId: true, assessorId: true },
  });
  if (!assignment) return;

  const clubs = await prisma.clubAssessment.findMany({
    where: { poolId: assignment.poolId },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.assessorScore.deleteMany({
      where: {
        assessorId: assignment.assessorId,
        criterionId: assignment.criterionId,
        assessmentId: { in: clubs.map((c) => c.id) },
      },
    }),
    prisma.criterionAssignment.delete({ where: { id: assignmentId } }),
  ]);

  refresh();
}

/** Hands a submitted line item back to its assessor to change. */
export async function reopenAssignment(formData: FormData) {
  await requireCdu();
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    select: { poolId: true },
  });
  if (!assignment) return;

  await prisma.criterionAssignment.update({
    where: { id: assignmentId },
    data: { submittedAt: null },
  });

  // Reopening one item pulls the pool's clubs back out of reconciliation, since
  // the assessment they were moved on the strength of is no longer complete.
  await prisma.clubAssessment.updateMany({
    where: { poolId: assignment.poolId, status: "RECONCILING", lockedAt: null },
    data: { status: "IN_ASSESSMENT" },
  });

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Pools                                                                      */
/* -------------------------------------------------------------------------- */

export async function createPool(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const cycleId = String(formData.get("cycleId") ?? "");
  const name = String(formData.get("name") ?? "").trim().toUpperCase();

  if (!name) return { status: "error", message: "Give the pool a name." };
  if (name.length > 12) return { status: "error", message: "Keep pool names short — “A”, “B”, “C”." };

  const existing = await prisma.pool.findUnique({ where: { cycleId_name: { cycleId, name } } });
  if (existing) return { status: "error", message: `Pool ${name} already exists in this cycle.` };

  const count = await prisma.pool.count({ where: { cycleId } });
  await prisma.pool.create({ data: { cycleId, name, position: count } });

  refresh();
  return { status: "ok", message: `Pool ${name} created.` };
}

/**
 * Moves a club into a pool — or out of one.
 *
 * Scores already recorded stay put. They belong to (club, criterion, assessor)
 * and remain valid evidence of what that assessor judged; what changes is who
 * is responsible for the club's remaining line items.
 */
export async function setClubPool(formData: FormData) {
  await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    select: { lockedAt: true },
  });
  if (!assessment || assessment.lockedAt) return;

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { poolId: poolId || null },
  });

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Non-Negotiable verification                                                */
/* -------------------------------------------------------------------------- */

export async function verifyNonNegotiable(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const resultId = String(formData.get("resultId") ?? "");
  const verdictRaw = String(formData.get("verdict") ?? "");
  const verdict = (
    ["PASS", "FAIL", "ON_NOTICE"].includes(verdictRaw) ? verdictRaw : "PENDING"
  ) as "PASS" | "FAIL" | "ON_NOTICE" | "PENDING";

  const result = await prisma.nonNegotiableResult.findUnique({
    where: { id: resultId },
    // The cycle comes along so a notice can be checked against earlier seasons.
    include: { assessment: { include: { cycle: true } }, nonNegotiable: true },
  });
  if (!result) return { status: "error", message: "That check no longer exists." };

  if (result.assessment.lockedAt) {
    return {
      status: "error",
      message: "This assessment is locked. Unlock it before changing a verdict.",
    };
  }

  const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
  if ((verdict === "FAIL" || verdict === "ON_NOTICE") && !adminNote) {
    // A failure costs the club its whole shield, and a notice is a warning the
    // club has one season to act on. Neither goes on the record without a
    // reason the club can read.
    return {
      status: "error",
      message:
        verdict === "ON_NOTICE"
          ? "A notice needs a note saying what the club has to put right this season."
          : "A failed check needs a note explaining why.",
    };
  }

  const threshold = result.nonNegotiable.kind === "SHIELD_THRESHOLD";

  // On Notice is FQ's verdict on the three Shield Threshold standards only. The
  // six gates are documents that are either submitted or aren't, and there is
  // nothing to put a club on notice about.
  if (verdict === "ON_NOTICE" && !threshold) {
    return {
      status: "error",
      message: "On notice only applies to the Shield Threshold standards, not to a gate check.",
    };
  }

  if (verdict === "ON_NOTICE") {
    // FQ allows one notice a year. A second is repeated non-compliance, and
    // checkEligibility would refuse both — better to refuse the second here,
    // where the Unit can still choose which one it means.
    const others = await prisma.nonNegotiableResult.count({
      where: {
        assessmentId: result.assessmentId,
        verdict: "ON_NOTICE",
        id: { not: resultId },
      },
    });
    if (others > 0) {
      return {
        status: "error",
        message:
          "This club is already on notice for another standard, and FQ allows one a year. " +
          "Resolve that one first, or record this as met or not met.",
      };
    }

    const lastSeason = await prisma.nonNegotiableResult.findFirst({
      where: {
        verdict: "ON_NOTICE",
        nonNegotiableId: result.nonNegotiableId,
        assessment: {
          clubId: result.assessment.clubId,
          cycle: { year: { lt: result.assessment.cycle.year } },
        },
      },
    });
    if (lastSeason) {
      return {
        status: "error",
        message:
          "This club was already on notice for this standard in a previous season. " +
          "FQ allows that once — a second is repeated non-compliance, so it has to be recorded as not met.",
      };
    }
  }

  // THRESHOLD_LEVELS rather than every shield: FQ sets its threshold standards
  // per shield, and Development Committed is a badge, not a shield — there is
  // no bar below Bronze to fall short of.
  const levelRaw = String(formData.get("shieldMet") ?? "");
  const shieldMet = THRESHOLD_LEVELS.find((s) => s === levelRaw) ?? null;

  const keepsLevel = verdict === "PASS" || verdict === "ON_NOTICE";

  if (threshold && keepsLevel && shieldMet === null) {
    // Passing a threshold check without saying which bar was met would leave
    // the cap open, and an open cap silently awards whatever the score earned —
    // the one outcome these checks exist to prevent.
    return {
      status: "error",
      message:
        verdict === "ON_NOTICE"
          ? "Say which shield's standard the notice lets the club keep."
          : "Say which shield's standard the club met before recording this one as passed.",
    };
  }

  // Departing from a computed level needs a reason on the record. The Unit is
  // entitled to exercise judgement — FQ plainly does — but a level that differs
  // from what the rules give should be a decision somebody signed, not a number
  // indistinguishable from arithmetic. This is the same bargain the reconcile
  // screen strikes when the CDU departs from the assessors' median.
  const derived = result.shieldMetDerived;
  const departing = threshold && keepsLevel && derived !== null && shieldMet !== derived;
  const overrideReason = String(formData.get("overrideReason") ?? "").trim() || null;

  if (departing && !overrideReason) {
    return {
      status: "error",
      message: `The club's recorded structure computes to ${derived}. Say why you're recording a different level.`,
    };
  }

  await prisma.nonNegotiableResult.update({
    where: { id: resultId },
    data: {
      verdict,
      adminNote,
      // A gate check has no level, and a level left behind on a check that has
      // been reset to unverified would go on capping the shield invisibly.
      shieldMet: threshold && keepsLevel ? shieldMet : null,
      overrideReason: departing ? overrideReason : null,
      verifiedById: verdict === "PENDING" ? null : cdu.id,
      verifiedAt: verdict === "PENDING" ? null : new Date(),
    },
  });

  revalidatePath(`/cda/cdu/assessments/${result.assessmentId}`, "layout");
  return {
    status: "ok",
    message: `${result.nonNegotiable.code} marked ${verdict.toLowerCase().replace("_", " ")}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

export async function resolveCriterion(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const criterionId = String(formData.get("criterionId") ?? "");
  const stars = Number(formData.get("stars"));

  // Bounded by the criterion's own maximum, not a constant — resolving a
  // three-point item to 4 would put a club above the maximum the report says it
  // was measured against.
  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    select: { maxScore: true, code: true },
  });
  if (!criterion) return { status: "error", message: "That criterion no longer exists." };

  if (!Number.isInteger(stars) || stars < 0 || stars > criterion.maxScore) {
    return {
      status: "error",
      message: `${criterion.code} is scored from 0 to ${criterion.maxScore}.`,
    };
  }

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.lockedAt) {
    return { status: "error", message: "This assessment is locked. Unlock it to change a score." };
  }

  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  await prisma.finalScore.upsert({
    where: { assessmentId_criterionId: { assessmentId, criterionId } },
    update: { stars, rationale, resolvedById: cdu.id, resolvedAt: new Date() },
    create: { assessmentId, criterionId, stars, rationale, resolvedById: cdu.id },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Resolved." };
}

/**
 * Accepts every criterion the assessors already agree on, in one go.
 *
 * This is the whole reason reconciliation is tractable: on a typical club the
 * assessors agree outright on most of the forty criteria, and asking the CDU to
 * click through those one at a time to reach the handful that are genuinely
 * split is how the disagreements get rubber-stamped along with everything else.
 * Anything with a spread is deliberately left alone.
 */
export async function acceptAgreed(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const overview = await loadAssessment(assessmentId);
  if (overview.assessment.lockedAt) {
    return { status: "error", message: "This assessment is locked." };
  }

  const agreed = overview.agreements.filter((a) => a.level === "AGREED" && a.final === null);

  for (const a of agreed) {
    await prisma.finalScore.create({
      data: {
        assessmentId,
        criterionId: a.criterion.id,
        stars: a.given[0],
        resolvedById: cdu.id,
      },
    });
  }

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return {
    status: "ok",
    message: agreed.length
      ? `Accepted ${agreed.length} criteri${agreed.length === 1 ? "on" : "a"} the assessors agreed on.`
      : "Nothing left to accept — every agreed criterion is already resolved.",
  };
}

/**
 * Records the CDU's paragraph of feedback on one macro-area.
 *
 * This is the part of the report a club actually acts on — "the framework
 * exists but is not applied below U14" says something a percentage cannot — so
 * it is written per area rather than once for the whole domain.
 */
export async function saveAreaNote(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const domain = String(formData.get("domain") ?? "");
  const area = String(formData.get("area") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();

  if (!["PLANNING", "DELIVERY", "OUTCOMES"].includes(domain)) {
    return { status: "error", message: "Unknown domain." };
  }

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    select: { publishedAt: true },
  });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.publishedAt) {
    return {
      status: "error",
      message: "This rating has been released. Withdraw it before editing the feedback.",
    };
  }

  if (!comment) {
    // Clearing is deleting: an empty paragraph on a report is worse than none.
    await prisma.areaNote.deleteMany({
      where: { assessmentId, domain: domain as never, area },
    });
  } else {
    await prisma.areaNote.upsert({
      where: {
        assessmentId_domain_area: { assessmentId, domain: domain as never, area },
      },
      update: { comment, authorId: cdu.id },
      create: { assessmentId, domain: domain as never, area, comment, authorId: cdu.id },
    });
  }

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: `${area} feedback saved.` };
}

/* -------------------------------------------------------------------------- */
/* Lock, publish, reopen                                                      */
/* -------------------------------------------------------------------------- */

export async function lockAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const overview = await loadAssessment(assessmentId);

  if (overview.unresolved.length > 0) {
    return {
      status: "error",
      message: `${overview.unresolved.length} criteri${
        overview.unresolved.length === 1 ? "on is" : "a are"
      } still unresolved.`,
    };
  }

  const pending = overview.assessment.nonNegotiables.filter((n) => n.verdict === "PENDING");
  if (pending.length > 0) {
    return {
      status: "error",
      message: `${pending.length} Non-Negotiable${
        pending.length === 1 ? " is" : "s are"
      } still unverified. Every check must be decided before locking.`,
    };
  }

  // Below the Bronze bar the Development Committed badge is the award, and it
  // turns on licence compliance. Freezing with that unanswered would record
  // "no badge" as a decision when it is really an omission — and the club would
  // be told so in writing.
  if (overview.rating.provisionalShield === "NONE" && overview.assessment.licenceCompliant === null) {
    return {
      status: "error",
      message:
        "This club scored below the Bronze bar, so record whether it is licence compliant in non-technical areas before locking — that decides the Development Committed badge.",
    };
  }

  await freezeResult(assessmentId, cdu.id);

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Scores locked and the result frozen." };
}

/**
 * Records whether the club is licence compliant in non-technical areas.
 *
 * The one condition Football Queensland attaches to the Development Committed
 * badge, and it isn't measured by this assessment — compliance sits under the
 * Advanced Participation Licence. So it is recorded rather than derived, and
 * left null until someone actually knows: a club that scores under 40% and has
 * never been looked at gets nothing, not a badge by default.
 */
export async function setLicenceCompliance(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (assessment.lockedAt) {
    return {
      status: "error",
      message: "This assessment is locked. Unlock it before changing licence compliance.",
    };
  }

  const raw = String(formData.get("licenceCompliant") ?? "");
  const licenceCompliant = raw === "yes" ? true : raw === "no" ? false : null;

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { licenceCompliant },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return {
    status: "ok",
    message:
      licenceCompliant === null
        ? "Licence compliance cleared."
        : licenceCompliant
          ? "Recorded as licence compliant."
          : "Recorded as not licence compliant.",
  };
}

export async function unlockAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (RELEASED_STATUSES.includes(assessment.status as never)) {
    return {
      status: "error",
      message: "This rating has been released to the club. Withdraw it before unlocking.",
    };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: {
      status: "RECONCILING",
      lockedAt: null,
      lockedById: null,
      // The frozen numbers are cleared with the lock. Leaving them behind would
      // let a stale result sit on the record while the live view recomputes,
      // and the two would disagree at exactly the moment someone is editing.
      finalPercent: null,
      technicalPct: null,
      planningPct: null,
      deliveryPct: null,
      outcomesPct: null,
      finalShield: null,
      eligible: null,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Unlocked. The result will be recomputed when you lock again." };
}

export async function publishAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (!assessment.lockedAt) {
    return { status: "error", message: "Lock the scores before releasing the rating." };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Rating released to the club." };
}

export async function withdrawAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  // A live review is a process the club has already started and has a clock
  // running on. Pulling the rating out from under it would leave a request with
  // nothing to review and a club that has spent its one allowance on it.
  const review = await prisma.reviewRequest.findUnique({ where: { assessmentId } });
  if (review) {
    return {
      status: "error",
      message:
        "This club has an open review request. Answer or resolve the review before withdrawing the rating.",
    };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "LOCKED", publishedAt: null },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Withdrawn. The club can no longer see the rating." };
}

/** Hands an assessment back to the club to correct something. */
export async function reopenForClub(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.lockedAt) {
    return { status: "error", message: "Unlock the assessment first." };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "IN_PROGRESS", clubSubmittedAt: null },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Reopened. The club can edit and resubmit." };
}

/* -------------------------------------------------------------------------- */
/* Cycle                                                                      */
/* -------------------------------------------------------------------------- */

const cycleSchema = z.object({
  technicalMaxPoints: z.coerce.number().int().min(0).max(5000),
  bronzeMin: z.coerce.number().int().min(0).max(100),
  silverMin: z.coerce.number().int().min(0).max(100),
  goldMin: z.coerce.number().int().min(0).max(100),
});

export async function updateCycle(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();
  const cycleId = String(formData.get("cycleId") ?? "");

  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Thresholds must be whole numbers from 0 to 100, and Technical points from 0 to 5000.",
    };
  }

  const d = parsed.data;

  if (!(d.bronzeMin < d.silverMin && d.silverMin < d.goldMin)) {
    return {
      status: "error",
      message: "Shield thresholds must increase: Bronze < Silver < Gold.",
    };
  }

  // Any published assessment in this cycle has its numbers frozen on its own
  // row, so a weight change here can't move a rating a club has already been
  // given. Saying so beats an admin discovering it by accident.
  const published = await prisma.clubAssessment.count({
    where: { cycleId, status: "PUBLISHED" },
  });

  const status = String(formData.get("status") ?? "");
  const validStatus = ["SETUP", "CLUB_ENTRY", "ASSESSING", "RECONCILING", "PUBLISHED"].includes(
    status,
  );

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { ...d, ...(validStatus ? { status: status as never } : {}) },
  });

  refresh();
  return {
    status: "ok",
    message:
      published > 0
        ? `Saved. ${published} already-published rating${published === 1 ? " is" : "s are"} unaffected — their results are frozen.`
        : "Cycle settings saved.",
  };
}

export async function createCycle(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { status: "error", message: "Enter a valid year." };
  }

  const existing = await prisma.cycle.findUnique({ where: { year } });
  if (existing) return { status: "error", message: `A ${year} cycle already exists.` };

  const cycle = await prisma.cycle.create({
    data: { year, name: `${year} Club Rating`, status: "SETUP" },
  });

  // A cycle without a structure bar can't compute NN7, and nothing in the
  // portal would say so — the check would simply sit at "not set" forever. The
  // demo used to be the only thing that created these, which made a real
  // instance the one place the feature didn't work.
  await ensureCycleStandards(cycle.id);

  refresh();
  return {
    status: "ok",
    message: `${year} cycle created. Add clubs, then move it to Club entry when you're ready for them to submit.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Review and appeal                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Records the Unit's answer on one line item the club put forward.
 *
 * Revising a score writes through to the reconciled `FinalScore` — a review
 * that changed a number but left the rating showing the old one would be a
 * review in name only. The frozen result is recomputed when the response is
 * sent, not here, so the club sees one movement rather than a percentage that
 * creeps while the Unit works through the list.
 */
export async function answerReviewItem(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.reviewItem.findUnique({
    where: { id: itemId },
    include: { request: { include: { assessment: true } }, criterion: true },
  });
  if (!item) return { status: "error", message: "That review item no longer exists." };

  if (item.request.respondedAt) {
    return {
      status: "error",
      message: "This review has already been sent to the club. Reopen it to make changes.",
    };
  }

  const response = String(formData.get("response") ?? "").trim();
  if (!response) {
    // FQ commits to "detailed feedback to the club regarding their request".
    // A bare outcome with no reasoning is the thing clubs appeal.
    return { status: "error", message: "Say what you found — the club sees this." };
  }

  const preserve = String(formData.get("outcome") ?? "") === "PRESERVED";

  const current = await prisma.finalScore.findUnique({
    where: {
      assessmentId_criterionId: {
        assessmentId: item.request.assessmentId,
        criterionId: item.criterionId,
      },
    },
  });

  if (preserve) {
    await prisma.reviewItem.update({
      where: { id: itemId },
      data: {
        outcome: "PRESERVED",
        response,
        scoreBefore: current?.stars ?? null,
        scoreAfter: current?.stars ?? null,
      },
    });
    revalidatePath(`/cda/cdu/assessments/${item.request.assessmentId}`, "layout");
    return { status: "ok", message: `${item.criterion.code} preserved.` };
  }

  const raw = String(formData.get("stars") ?? "");
  const stars = Number.parseInt(raw, 10);
  if (!Number.isInteger(stars) || stars < 0 || stars > item.criterion.maxScore) {
    return {
      status: "error",
      message: `Choose a score from 0 to ${item.criterion.maxScore}.`,
    };
  }

  await prisma.finalScore.upsert({
    where: {
      assessmentId_criterionId: {
        assessmentId: item.request.assessmentId,
        criterionId: item.criterionId,
      },
    },
    update: {
      stars,
      resolvedById: cdu.id,
      // The rationale carries the review's fingerprint, so anyone reading the
      // reconciliation later sees why a score departs from what the assessors
      // agreed rather than assuming the CDU simply overrode them.
      rationale: `Revised on review: ${response}`,
    },
    create: {
      assessmentId: item.request.assessmentId,
      criterionId: item.criterionId,
      stars,
      resolvedById: cdu.id,
      rationale: `Revised on review: ${response}`,
    },
  });

  await prisma.reviewItem.update({
    where: { id: itemId },
    data: {
      outcome: "REVISED",
      response,
      scoreBefore: current?.stars ?? null,
      scoreAfter: stars,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${item.request.assessmentId}`, "layout");
  return {
    status: "ok",
    message: `${item.criterion.code} revised to ${stars}.`,
  };
}

/**
 * Sends the Unit's response and recomputes the rating.
 *
 * The re-freeze is the whole point. A review that revised scores has changed
 * the answer, and the frozen columns are what the club is shown, so they have
 * to be rewritten — this is the one legitimate reason to move a number a club
 * has already been given, and it is done in the open with the before figures
 * preserved on the request.
 */
export async function sendReviewResponse(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.reviewRequest.findUnique({
    where: { id: requestId },
    include: { items: true, assessment: true },
  });
  if (!request) return { status: "error", message: "That review no longer exists." };
  if (request.respondedAt) {
    return { status: "error", message: "This review has already been answered." };
  }

  const unanswered = request.items.filter((i) => i.outcome === "PENDING");
  if (unanswered.length > 0) {
    return {
      status: "error",
      message: `${unanswered.length} item${
        unanswered.length === 1 ? " is" : "s are"
      } still unanswered. Football Queensland answers on every item the club puts forward.`,
    };
  }

  const response = String(formData.get("response") ?? "").trim() || null;

  // Recompute from the revised scores. freezeResult reads the live reconciled
  // scores, so this picks up every revision made above in one pass.
  await freezeResult(request.assessmentId, cdu.id);

  await prisma.reviewRequest.update({
    where: { id: requestId },
    data: {
      status: "RESPONDED",
      respondedAt: new Date(),
      respondedById: cdu.id,
      response,
    },
  });

  // freezeResult sets LOCKED; the rating is already with the club, so put it
  // back where it belongs — released, and now inside the appeal window.
  await prisma.clubAssessment.update({
    where: { id: request.assessmentId },
    data: { status: "PUBLISHED" },
  });

  revalidatePath(`/cda/cdu/assessments/${request.assessmentId}`, "layout");
  return { status: "ok", message: "Response sent. The club now has 3 working days to appeal." };
}

/** Records the CEO's ruling. Final — nothing follows it. */
export async function decideAppeal(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.reviewRequest.findUnique({ where: { id: requestId } });
  if (!request) return { status: "error", message: "That review no longer exists." };
  if (!request.appealedAt) return { status: "error", message: "There's no appeal to decide." };
  if (request.appealDecidedAt) {
    return { status: "error", message: "This appeal has already been decided." };
  }

  const decision = String(formData.get("decision") ?? "").trim();
  if (!decision) {
    return { status: "error", message: "Record the decision — the club sees this in full." };
  }

  await prisma.reviewRequest.update({
    where: { id: requestId },
    data: {
      status: "APPEAL_DECIDED",
      appealDecidedAt: new Date(),
      appealDecidedById: cdu.id,
      appealDecision: decision,
    },
  });

  // The appeal decision exhausts the process, so the rating confirms here
  // rather than waiting for a clock that has nothing left to run.
  await prisma.clubAssessment.update({
    where: { id: request.assessmentId },
    data: { status: "CONFIRMED" },
  });

  revalidatePath(`/cda/cdu/assessments/${request.assessmentId}`, "layout");
  return { status: "ok", message: "Appeal decided and the rating confirmed." };
}

/**
 * Marks a rating Confirmed once its windows have run out.
 *
 * Football Queensland confirms by the clock, not by a decision — "if there is
 * no review request, the club assessment score is set and final (Confirmed)
 * after the review timeframe has lapsed". There is no scheduler here, so this
 * is the manual equivalent: the button appears exactly when the timeline says
 * the rating is already settled, and the guard below is what stops it being
 * pressed a day early.
 */
export async function confirmRating(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    include: { review: true },
  });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review: assessment.review,
  });

  if (!timeline.shouldConfirm) {
    return {
      status: "error",
      message:
        timeline.stage === "CONFIRMED"
          ? "This rating is already confirmed."
          : `Not yet — ${STAGE_LABELS[timeline.stage].toLowerCase()}. The club's window is still open.`,
    };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "CONFIRMED" },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Rating confirmed. The club may now display its shield." };
}

/* -------------------------------------------------------------------------- */
/* Bulk club import                                                           */
/* -------------------------------------------------------------------------- */

export type ImportPreviewState = {
  status: "idle" | "ok" | "error";
  message?: string;
  plan?: ImportPlan;
  /** Echoed back so the commit works from exactly what was previewed. */
  csv?: string;
};

async function tierCodes() {
  return (await prisma.tier.findMany({ orderBy: { position: "asc" } })).map((t) => t.code);
}

/**
 * Reads the pasted file and says what it would do. Writes nothing.
 *
 * A separate step from the commit because thirty-seven clubs is too many to
 * undo by hand. The preview and the write parse the same text with the same
 * function, so what is approved is what happens.
 */
export async function previewClubImport(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  await requireCdu();

  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { status: "error", message: "Paste some rows first." };

  const parsed = parseClubCsv(csv, await tierCodes());

  const [clubs, users, assessors] = await Promise.all([
    prisma.club.findMany({ select: { name: true } }),
    prisma.user.findMany({ select: { email: true } }),
    prisma.user.findMany({ where: { ...ASSESSOR_POOL_WHERE, active: true }, select: { email: true } }),
  ]);

  const plan = planImport(
    parsed,
    clubs,
    users.map((u) => u.email),
    assessors.map((u) => u.email),
  );

  if (plan.plans.length === 0) {
    return {
      status: "error",
      message: "Nothing importable in that. See the problems below.",
      plan,
      csv,
    };
  }

  return { status: "ok", plan, csv };
}

export type ImportCommitState = {
  status: "idle" | "ok" | "error";
  message?: string;
  /** One per administrator created, to be handed out. Shown once. */
  invites?: { club: string; name: string; email: string; url: string; expiresAt: string }[];
};

/**
 * Creates or updates every club in the file, and any administrators with it.
 *
 * Sequential rather than a single transaction on purpose: a partial import that
 * reports which rows landed is recoverable by re-pasting the same file, since
 * every row is an upsert. An all-or-nothing import that fails on row thirty-one
 * tells the operator nothing about rows one to thirty.
 */
export async function commitClubImport(
  _prev: ImportCommitState,
  formData: FormData,
): Promise<ImportCommitState> {
  await requireCdu();

  const csv = String(formData.get("csv") ?? "");
  const parsed = parseClubCsv(csv, await tierCodes());
  if (parsed.rows.length === 0) {
    return { status: "error", message: "Nothing to import." };
  }

  const cycle = await activeCycle();
  const tiers = new Map(
    (await prisma.tier.findMany()).map((t) => [t.code, t.id]),
  );

  // Matched here in JS, case-insensitively, because that is how the preview
  // matched. SQLite has no `mode: "insensitive"`, so a database `equals` would
  // create "brisbane city fc" alongside "Brisbane City FC" — the preview would
  // have promised an update and the import would have delivered a duplicate.
  const byName = new Map(
    (await prisma.club.findMany({ select: { id: true, name: true } })).map((c) => [
      c.name.trim().toLowerCase(),
      c.id,
    ]),
  );

  const invites: NonNullable<ImportCommitState["invites"]> = [];
  let created = 0;
  let updated = 0;
  const failures: string[] = [];

  for (const row of parsed.rows) {
    try {
      const tierId = row.assessmentTier ? (tiers.get(row.assessmentTier) ?? null) : null;

      const data = {
        name: row.name,
        zone: row.zone || null,
        tier: row.tier || null,
        contactName: row.contactName || null,
        contactEmail: row.contactEmail || null,
        // Only when the file said so. A re-paste that omits the column must not
        // wipe a tier somebody set deliberately.
        ...(tierId ? { tierId } : {}),
      };

      const existingId = byName.get(row.name.trim().toLowerCase());

      let club;
      if (existingId) {
        club = await prisma.club.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        let slug = slugify(row.name);
        for (let n = 2; await prisma.club.findUnique({ where: { slug } }); n += 1) {
          slug = `${slugify(row.name)}-${n}`;
        }
        club = await prisma.club.create({ data: { ...data, slug } });
        byName.set(club.name.trim().toLowerCase(), club.id);
        created += 1;
      }

      if (cycle) {
        // Creates the assessment, which inherits the tier just set on the club.
        // An assessment that already existed is corrected too, so re-importing
        // with a fixed tier repairs the season rather than only the club.
        const assessment = await ensureAssessment(club.id, cycle.id);
        if (tierId && assessment.tierId !== tierId) {
          await prisma.clubAssessment.update({ where: { id: assessment.id }, data: { tierId } });
        }
      }

      if (row.cdaEmail) {
        const cda = await prisma.user.findFirst({
          where: { email: normalizeEmail(row.cdaEmail), ...ASSESSOR_POOL_WHERE, active: true },
          select: { id: true },
        });
        // Silent when the address isn't an assessor: the preview already said
        // so per row, and creating the account here would mint one nobody
        // asked for.
        if (cda) {
          await prisma.clubAmbassador.upsert({
            where: { clubId_userId: { clubId: club.id, userId: cda.id } },
            update: {},
            create: { clubId: club.id, userId: cda.id },
          });
        }
      }

      if (row.adminEmail) {
        const email = normalizeEmail(row.adminEmail);
        const already = await prisma.user.findUnique({ where: { email } });
        if (!already) {
          const user = await prisma.user.create({
            data: {
              email,
              name: row.adminName || null,
              title: "Club Administrator",
              role: "CLUB",
              clubMemberships: { create: { clubId: club.id } },
            },
          });
          const invite = await buildInvite(user.id, email);
          invites.push({
            club: club.name,
            name: row.adminName || email,
            email,
            url: invite.url,
            expiresAt: invite.expiresAt,
          });
        }
      }
    } catch (e) {
      failures.push(`Line ${row.line} (${row.name}): ${(e as Error).message}`);
    }
  }

  refresh();

  const summary =
    `${created} club${created === 1 ? "" : "s"} added, ${updated} updated, ` +
    `${invites.length} administrator${invites.length === 1 ? "" : "s"} created.`;

  if (failures.length > 0) {
    return {
      status: "error",
      message: `${summary} ${failures.length} row${failures.length === 1 ? "" : "s"} failed: ${failures.join("; ")}`,
      invites,
    };
  }

  return { status: "ok", message: summary, invites };
}
