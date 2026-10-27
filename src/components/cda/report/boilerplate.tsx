import { Crest, ProseSlide, Slide, SlideHeader } from "@/components/cda/report/slides";

/**
 * The pages that are the same for every club.
 *
 * Thirteen of the thirty-three. They are Football Queensland's standing
 * explanation of the process — purpose, scope, how the rating is reached, what
 * a club may do with it, and how to ask for a review — and they change once a
 * year in the Info Pack rather than once a club.
 *
 * Held here as content rather than as an imported deck so the one thing that
 * must not drift does not: the rating thresholds on the Categories page are
 * read from the cycle, so a year that moves Silver to 60% moves this page too.
 * In FQ's own file those numbers are typed.
 *
 * The photographs are Football Queensland's own and are not reproduced here.
 * Drop them into `public/report/` and these pages carry them, named for the
 * page they belong to — `disclaimer`, `purpose`, `scope`, `process`,
 * `delivery`, `review` — in .jpg, .png or .webp. Nothing invents imagery, and a
 * page with no photograph gives the text the full width rather than leaving a
 * hole where one should be.
 */

export function DisclaimerSlide({ year, photo }: { year: number; photo?: string | null }) {
  return (
    <ProseSlide title="DISCLAIMER" photo={photo}>
      <p>
        Congratulations on your work participating in Football Queensland&apos;s Club Development
        and Assessment process, this is the starting point of our club development initiative.
      </p>
      <p>
        Please note that this document is <strong>not</strong>{" "}
        for the public domain. The score provided is your club&apos;s preliminary score, and you
        can ask for review or other further steps specified in this document.
      </p>
      <p>
        After the assessment score is elevated to a &lsquo;confirmed&rsquo; status your Club will
        receive their FQ Club Shield for {year + 1}. The FQ Club Shield is the only part of the
        assessment that can be used for public viewing.
      </p>
      <p>
        Sharing any part of the documentation with third parties is a breach of confidentiality and
        reporting commitments of FQ license clubs. Failing of compliance will result in unrated
        status.
      </p>
      <p className="font-semibold">
        Receiving an FQ Club Assessment Score does not automatically qualify your club to receive
        an FQ Advanced Junior Participation License for Season {year + 1}. Should your club be
        invited to submit an FQ Advanced Junior License application, your Club will be required to
        comply with all other criteria and conditions of the participation License Agreement.
      </p>
    </ProseSlide>
  );
}

export function PurposeSlide({ photo }: { photo?: string | null }) {
  return (
    <ProseSlide title="DEVELOPMENT &amp; ASSESSMENT PURPOSE" photo={photo}>
      <p>
        The main purpose of the Club Development and Assessment process is to constructively
        reflect each club&apos;s position in terms of their individual growth and development.
      </p>
      <p className="font-semibold">The technical assessment will:</p>
      <ul className="ml-6 list-disc space-y-1">
        <li>Improve clubs&apos; understanding of their strengths and weaknesses</li>
        <li>Drive FQ&apos;s strategic objectives (Participation, Clubs, Coaches)</li>
        <li>Create a technical starting point for Club Development</li>
        <li>Introduce quality assurance in line with sport industry standards</li>
        <li>Improve and synchronise previous feedback protocols</li>
        <li>Identify and share best practice</li>
        <li>Protect clubs who are demonstrating they are &lsquo;doing the right thing&rsquo;</li>
        <li>Provide a platform to support &lsquo;Best vs best&rsquo; &amp; &lsquo;Like vs like&rsquo;</li>
      </ul>
    </ProseSlide>
  );
}

export function ProcessCycleSlide() {
  const steps = [
    ["CONSULTATION", "With Club Technical Directors, Coaches and Administrators"],
    ["DEVELOPMENT", "Bespoke and individualized for club's needs. Ongoing formal and informal assistance"],
    ["ASSESSMENT", "Communicating findings to TD and Club President. Collaboratively devising a plan"],
    ["ADDED VALUE", "Accessing resources. Individualized support. Central services"],
  ];
  return (
    <Slide dark>
      <div className="flex h-full flex-col justify-center px-20">
        <h2 className="mb-16 text-center text-5xl font-bold text-white">
          <span className="text-[#7fd9e8]">ONGOING</span> CLUB DEVELOPMENT
          <br />&amp; ASSESSMENT PROCESS
        </h2>
        <div className="grid grid-cols-4 gap-8">
          {steps.map(([title, body]) => (
            <div key={title} className="text-center">
              <div className="mx-auto mb-6 h-24 w-24 rounded-full border-4 border-[#7fd9e8] bg-white" />
              <p className="font-bold text-white">{title}</p>
              <p className="mt-2 text-sm text-white/80">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function AssessmentAreasSlide() {
  return (
    <ProseSlide title="ASSESSMENT AREAS">
      <p className="font-semibold">
        FQ has consulted on objectives with TDs to understand club goals and set an action plan.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-10">
        <div>
          <p className="mb-3 font-bold">UNDERSTAND HOW CLUBS…</p>
          <ul className="space-y-3">
            <li>
              <strong>PLAN</strong> their programs
            </li>
            <li>
              <strong>DELIVER</strong> their programs
            </li>
            <li>
              <strong>ACHIEVE OUTCOMES</strong>, celebrate success
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-bold">AND CONSEQUENTLY, HOW FQ…</p>
          <ul className="space-y-3">
            <li>
              <strong>IDENTIFY AND INFLUENCE</strong> key areas in planning
            </li>
            <li>
              <strong>IMPROVE</strong> program delivery
            </li>
            <li>
              <strong>ASSESS AND REFINE</strong> services to our clubs
            </li>
          </ul>
        </div>
      </div>
    </ProseSlide>
  );
}

export function ScopeSlide({ year, photo }: { year: number; photo?: string | null }) {
  return (
    <ProseSlide title="SCOPE AND APPLICATION" photo={photo}>
      <p>
        The Advanced Academy assessment shall apply to all {year} FQ Academy Boys and Girls Program
        Licence Holders.
      </p>
      <p>
        Football Queensland (FQ) will interpret and apply all articles of the Advanced Assessment
        process, and any such interpretation or application will be final and binding on all
        parties.
      </p>
      <p>This assessment applies to Club participants in the following programs unless stated otherwise:</p>
      <ul className="ml-6 list-disc space-y-1">
        <li>Football Queensland Academy League 1-4 Boys (U9-U12)</li>
        <li>Football Queensland Academy League 1-2 Girls (U9-U12)</li>
        <li>Football Queensland Academy League 1-4 Boys (U13-U18)</li>
        <li>Football Queensland Academy League 1-2 Girls (U13-U17)</li>
      </ul>
    </ProseSlide>
  );
}

export function ProcessSlide({ photo }: { photo?: string | null }) {
  return (
    <ProseSlide title="ASSESSMENT PROCESS" photo={photo}>
      <p className="font-bold">CLUB SUBMISSION</p>
      <p>
        Clubs submit their Planning, Delivery and Outcome documents throughout the year with the
        process ending on 31st of July.
      </p>
      <p className="font-bold">ASSESSMENT</p>
      <p>
        In line with recommendations from Double Pass, Football Queensland has separated the
        Development and Assessment processes. The Club Assessment Unit (CAU) now collectively
        manages the assessment of ALL Club Planning &amp; Outcome documentation.
      </p>
      <p>
        The planning documents and &lsquo;evidence-based&rsquo; delivery items are assessed via a
        &lsquo;vertical&rsquo; assessment, with FQ technical staff allocated to assess every club
        for the allocated item/s. The observation-based club&apos;s delivery assessment is assessed
        by at least two members of the Club Development and Assessment Unit.
      </p>
      <p className="font-bold">PRELIMINARY ASSESSMENT SCORING</p>
      <p>
        Within this document, you have now received your assessment feedback, reflecting a
        comprehensive evaluation of your club&apos;s planning, delivery, and outcomes.
      </p>
    </ProseSlide>
  );
}

export function DeliveryProcessSlide({ photo }: { photo?: string | null }) {
  return (
    <ProseSlide title="ASSESSMENT PROCESS DELIVERY" photo={photo}>
      <p className="font-bold">INFORMAL CONSULTATIONS</p>
      <ul className="ml-6 list-disc">
        <li>
          Club Development Ambassador&apos;s (CDA) meetings with the Club Technical Director /
          Technical Lead (in person or online).
        </li>
        <li>CDA&apos;s interactions with Coaches and other staff.</li>
      </ul>
      <p className="font-bold">CLUB VISITS &amp; OBSERVATIONS</p>
      <ul className="ml-6 list-disc">
        <li>Training night visits to the Club (FQ Academy).</li>
        <li>After an initial visit, training and game visits may be unannounced.</li>
        <li>FQ Academy game day visits — includes CDA&apos;s observations on coach&apos;s behaviors.</li>
      </ul>
      <p className="font-bold">FORMAL MEETINGS</p>
      <ul className="ml-6 list-disc">
        <li>Club-specific meetings (e.g., TD, Club President, Head of Admin).</li>
      </ul>
      <p className="font-bold">EDUCATIONAL EVENTS</p>
      <ul className="ml-6 list-disc">
        <li>Webinars, workshops and small group meetings with clubs.</li>
        <li>Shared best practices delivered by technical staff of selected clubs.</li>
      </ul>
    </ProseSlide>
  );
}

export function RatingSlideBoilerplate({ year }: { year: number }) {
  return (
    <ProseSlide title="FQ CLUB ASSESSMENT RATING">
      <p>
        Clubs can only communicate their &lsquo;confirmed&rsquo; Academy Assessment rating by
        displaying their Club Shield.
      </p>
      <p>
        The Preliminary rating (delivered via this document) is either accepted, or a review is
        requested by the club.
      </p>
      <p>
        When the rating is Confirmed, FQ provides a Club Shield for {year + 1} that the club can
        use on their media platforms.
      </p>
      <p>
        Release of any other details of the assessment score results a breach of the FQ Advanced
        Participation Licence Agreement.
      </p>
    </ProseSlide>
  );
}

/**
 * The bars, read from the cycle rather than typed.
 *
 * FQ restates these each year — Silver moves to 60% in 2027 — and this is the
 * page a club checks its own percentage against, so it has to come from the
 * same figures the rating was computed with.
 */
export function CategoriesSlide({
  goldMin,
  silverMin,
  bronzeMin,
}: {
  goldMin: number;
  silverMin: number;
  bronzeMin: number;
}) {
  const rows = [
    ["Gold", `${goldMin}%`, `Gold rating is awarded if a minimum of ${goldMin}% is achieved out of the overall maximum points in the FQ Academy assessment.`],
    ["Silver", `${silverMin}%`, `Silver rating is awarded if a minimum of ${silverMin}% is achieved out of the overall maximum points in the FQ Academy assessment.`],
    ["Bronze", `${bronzeMin}%`, `Bronze rating is awarded if a minimum of ${bronzeMin}% is achieved out of the overall maximum points in the FQ Academy assessment.`],
    ["Development Committed", "—", `All Clubs scoring less than ${bronzeMin}% of the overall points will receive an FQ Development Committed badge for their FQ Academy assessment if they are licence compliant (in non-technical areas).`],
  ];

  return (
    <Slide>
      <SlideHeader title="ASSESSMENT RATING CATEGORIES" />
      <div className="space-y-4 px-12 py-8">
        {rows.map(([name, , text]) => (
          <div key={name} className="flex items-center gap-6 rounded bg-ink-100 px-6 py-5">
            <span className="w-52 shrink-0 text-lg font-bold text-maroon-800">{name}</span>
            <p className="text-[15px] leading-snug text-ink-900">{text}</p>
          </div>
        ))}
        <p className="pt-2 text-center text-xs text-ink-600">
          Shield ratings are subject to meeting Shield Threshold Standards as outlined within the
          Club Development &amp; Assessment Information pack.
        </p>
      </div>
    </Slide>
  );
}

export function ReviewAppealSlide({ photo }: { photo?: string | null }) {
  return (
    <ProseSlide title="REVIEW AND APPEAL" photo={photo}>
      <p>
        Upon receipt of the Preliminary Rating clubs can submit their review request with specific
        comments regarding areas they request a review of within 8 days through the Club
        Development Review Form.
      </p>
      <p>
        Clubs may only request a review if they believe relevant evidence for the selected item was
        missed due to an oversight. It is the sole responsibility of the Club to upload all key
        evidence to the relevant folder within the Club Hub.
      </p>
      <p>
        A score review can be requested for a maximum of 4 line items in the Planning, 4 line items
        in the Delivery, and 2 line items in the Outcome section. A maximum of 10 line items will
        be reviewed by the Club Assessment Unit.
      </p>
      <p>
        If there is no review request, the club assessment score is set and final (Confirmed) after
        the review timeframe has lapsed. Upon receipt of the review request, the Unit provides
        detailed feedback and communicates the revised or preserved score within 10 working days.
      </p>
      <p>
        Clubs can appeal the outcome of the review within 3 working days to the CEO of Football
        Queensland via email. The CEO has 8 working days to respond and revise or preserve the
        score.
      </p>
      <p>
        No assessment score can be elevated to &lsquo;Confirmed&rsquo; status while non-negotiable
        documents are missing or incomplete.
      </p>
    </ProseSlide>
  );
}

export function NextStepsSlide() {
  return (
    <ProseSlide title="NEXT STEPS">
      <ul className="ml-6 list-disc space-y-3">
        <li>
          The Club&apos;s decision to submit a review request needs to be communicated within 8 days
          via email to technical@footballqueensland.com.au and the Review Form to be submitted as
          stated on the &lsquo;review and appeal&rsquo; page.
        </li>
        <li>
          If there is no review request, the club assessment score is set and final
          (&lsquo;confirmed&rsquo;) after the review timeframe has lapsed or if the Club accepts the
          assessment score.
        </li>
        <li>
          No assessment score can be elevated to &lsquo;Confirmed&rsquo; status if any
          Non-negotiable documents are missing or incomplete.
        </li>
        <li>
          After the rating is &lsquo;confirmed&rsquo;, Football Queensland provides a Club Shield
          that the club can use on their media platforms.
        </li>
        <li>
          Following the confirmed assessment, Club officials and FQ CD&amp;A members meet to
          identify key areas to collaborate and start the next phase.
        </li>
      </ul>
    </ProseSlide>
  );
}

export function ClosingSlide({
  year,
  club,
  logoId,
}: {
  year: number;
  club: string;
  logoId: string | null;
}) {
  return (
    <Slide dark>
      <div className="flex h-full flex-col items-center justify-center">
        <Crest logoId={logoId} name={club} size={120} />
        <p className="mt-10 text-xl italic text-white/90">
          FQ is looking forward to collaborating with you again in {year + 1}
        </p>
      </div>
    </Slide>
  );
}
