/**
 * Football Australia's assessment rubric, in its own words.
 *
 * The descriptor grid printed as an appendix on FQ's `C Diploma Assessment —
 * Action Plan` document: six areas down, the four levels across, and what each
 * cell means. Transcribed from the copy returned for Leesa Faunt's October 2026
 * assessment, which is the version the CETs are working from.
 *
 * Separate from `delivery-rubric.ts` on purpose. That file is the *instrument* —
 * the codes, the thresholds, the arithmetic — and is imported by the assessment
 * form, so it is pure, client-safe and small. This is a page of reference prose
 * that only the exported documents print, and twenty-four paragraphs of it have
 * no business in a client bundle.
 *
 * The one word changed from the source: the tick table on FQ's document labels
 * the sixth area `MOTIVATIONAL CLIMATE` while its own appendix calls it
 * `Environment`. The two disagree on the same page. `Environment` is kept
 * because it is what the appendix says, what Football Australia's guide says,
 * and what `DeliveryScore.code` stores.
 *
 * Quoted material. If FA revise the rubric, re-transcribe it rather than
 * paraphrasing: an assessor ticking a 2 is reading these exact sentences.
 */

/** The four levels, as the appendix heads its columns. */
export const APPENDIX_LEVELS = [
  "Not Evident (0)",
  "Developing (1)",
  "Proficient (2)",
  "Expertise (3)",
] as const;

export type AppendixRow = {
  /** Matches `DeliveryArea.code` in `delivery-rubric.ts`. */
  code: string;
  /** The area's name as the appendix prints it, sub-headings and all. */
  heading: string[];
  /** One descriptor per level, in `APPENDIX_LEVELS` order. */
  levels: [string, string, string, string];
};

export const FA_RUBRIC_APPENDIX: AppendixRow[] = [
  {
    code: "OBJECTIVE",
    heading: ["Objective"],
    levels: [
      "Objectives are vague or not communicated effectively.",
      "Objectives are identified but lack clarity and communication is inconsistent or only partially effective",
      "Objectives are clear and achievable, and communicated effectively",
      "Objectives are clear and concise, have specific detail, are measurable and communicated effectively to all players.",
    ],
  },
  {
    code: "CONTENT",
    heading: ["Content", "Relevance", "Realism", "Repetition", "Rewards", "Reflection"],
    levels: [
      "Content is irrelevant, or is vague to linking with objective, failing to address one or more of the 5 Rs. (Relevance, Realism, Repetition, Rewards, Reflection).",
      "Content shows some relevance to the objective but lacks consistency or clarity. Some of the 5 Rs are addressed, but application is incomplete. Limited connection to technical actions/principles of play, with minimal or unclear visual cues.",
      "Content is relevant and aligns with the objective and clearly addresses all 5 Rs. Content aligns with the technical actions/principles of play with detail on the specific visual cues linked to player actions and habits.",
      "Content is highly relevant, meets the objective, covering all 5 Rs extremely well. Detailed insights of the Technical Actions/Principles of Play, with exceptional detail on the specific visual cues linked player actions and habits.",
    ],
  },
  {
    code: "ORGANISATION",
    heading: ["Organisation"],
    levels: [
      "Session is poorly organised and lacks structure and flow.\nPoor use of equipment (balls, bibs, cones, goal, etc.)",
      "Session shows some structure but lacks consistency in organisation and flow. Transitions are occasionally unclear or slow, and player grouping only partially supports the learning experience.\nSome good use of equipment (balls, bibs, cones, goal, etc.)",
      "Organisation is adequate; session is structured with clear and smooth transitions. Players are adequately grouped to ensure their learning experience.\nGood use of equipment (balls, bibs, cones, goal, etc.).",
      "Organisation is exemplary; session is well-structured, with clear, logical progression, smooth transitions and players are grouped to enhance their learning is directly linked to the game.\nExcellent use of equipment (balls, bibs, cones, goal, etc.) and session set up considering pitch geography related to the topic.",
    ],
  },
  {
    code: "PRESENTING",
    heading: ["Presenting", "Engage", "Explain", "Exit"],
    levels: [
      "Presentation is unclear or ineffective with no demonstration or representation of the 3Es of (Engage, Explain and Exit) hindering understanding and engagement.\nNo evidence of use of SOCHANGEIT or 5 Rs.",
      "Presentation shows some clarity but is inconsistent in delivery. Limited or inconsistent use of the 3Es, and few methods are used to support player understanding.\nLimited evidence of use of SOCHANGEIT or 5 Rs.",
      "Presentation is clear and effective, various methods are used to aid in the players understanding. The 3Es of (Engage, Explain and Exit) are clearly utilised in delivering advanced concepts.\nGood evidence of use of SOCHANGEIT or 5 Rs.",
      "Presentation is highly effective, engaging, and adaptable. Multiple methods are used seamlessly to enhance understanding. The 3Es are embedded purposefully, with precise timing and delivery that maximises player engagement and learning.\nExcellent evidence of use of SOCHANGEIT or 5 Rs.",
    ],
  },
  {
    code: "COACHING",
    heading: ["Coaching", "Enter", "Enhance/Educate", "Ensure"],
    levels: [
      "Coaching methods are ineffective or, does not identify the correct time to enter. Coach has an inability to enhance the shape of both teams, realism within the practice, use of SOCHANGEIT or educate throughout the session.",
      "Coaching methods show some effectiveness but are inconsistent or not always aligned to the session objective. Timing of interventions is irregular or not always appropriate. Limited ability to enhance learning through shape/realism management and use of SOCHANGEIT within the practice, there are inconsistent links between visual cues and player actions.",
      "Coaching methods are effective, consistent, and aligned with advanced intervention techniques. Clear identification of when to enter and shows an ability to enhance the shape/realism within the practice, and use of SOCHANGEIT and educate throughout the session with some specific visual cues to player actions given to the players.",
      "Coaching methods are highly effective, efficient, content is consistent, language used is clear. Coach identifies an ability to enhance the shape and realism and use of SOCHANGEIT quickly and effectively. Coach can enter the practice consistently in the moment consistently linking specific visual cues to player actions for the collective team. Coaches consistently ensures that the learning is taking place through high levels of observation.",
    ],
  },
  {
    code: "ENVIRONMENT",
    heading: ["Environment"],
    levels: [
      "Environment is poorly managed, with issues in safety, inclusivity, or motivation.",
      "Environment is inconsistently managed. Some engagement or inclusive practices are evident, but safety, motivation, or control may be inconsistent. Limited use of strategies to maintain or enhance learning conditions.",
      "Environment is managed adequately, with good engagement and inclusive practices but may lack in advanced motivational strategies.",
      "Environment is expertly managed, ensuring optimal engagement, and motivation, creating ideal setting for advanced development and self-directed learners.",
    ],
  },
];
