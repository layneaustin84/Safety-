/**
 * Geographic restrictions and relocation.
 *
 * The controlling rule here lives in the parties' own order, not in the code.
 * Texas has no relocation statute: § 153.134(b)(1) requires the court to either
 * fix a geographic area for the child's primary residence or state that there
 * is none, and the language it uses varies from order to order. A move is then
 * litigated as a modification under § 156.101 on best-interest grounds.
 *
 * So this module deliberately refuses to guess. It will not assume the common
 * "Harris County and contiguous counties" formulation, because an order that
 * says "Harris County only", "Spring ISD boundaries", or "the State of Texas"
 * produces a completely different answer for the same proposed move. Where the
 * verbatim language is missing, the analysis reports exactly that and says what
 * to go read.
 */

export type RestrictionExistence = "yes" | "no" | "unknown";
export type RestrictionSubject = "primary_conservator" | "both_parents" | "unknown";

export interface GeographicRestrictionFacts {
  /** Whether the order contains a geographic restriction at all. */
  readonly exists: RestrictionExistence;
  /** The area, quoted from the order. Not paraphrased, not assumed. */
  readonly areaVerbatim?: string;
  /** Who the restriction binds. */
  readonly appliesTo?: RestrictionSubject;
  /** Conditions that lift or change it, quoted from the order. */
  readonly exceptionsVerbatim?: string;
  /** Where the parent proposes to move. */
  readonly proposedDestination?: string;
  /** Whether the parent is asking to change or lift the restriction itself. */
  readonly seeksToModifyRestriction?: boolean;
}

export type RelocationDetermination =
  | "no_restriction_reported"
  | "requires_order_language"
  | "requires_legal_judgment"
  | "restriction_status_unknown";

export interface RelocationAnalysis {
  readonly determination: RelocationDetermination;
  readonly summary: string;
  /** What the user must supply or confirm before anything further is possible. */
  readonly needed: readonly string[];
  readonly legalFramework: readonly string[];
  readonly nextSteps: readonly string[];
  readonly caveats: readonly string[];
}

const FRAMEWORK: readonly string[] = [
  "Tex. Fam. Code § 153.134(b)(1): a joint managing conservatorship order must either " +
    "establish a geographic area for the child's primary residence or state that the " +
    "conservator with that right may determine it without regard to geographic location.",
  "Tex. Fam. Code § 156.101: changing the order requires a material and substantial " +
    "change in circumstances plus the child's best interest.",
  "Tex. Fam. Code § 153.002: best interest is always the primary consideration.",
  "Lenz v. Lenz, 79 S.W.3d 10 (Tex. 2002): Texas has no relocation statute. Courts weigh " +
    "the reasons for and against the move, the effect on the other parent's relationship " +
    "with the child, whether the move improves the family's circumstances, and whether " +
    "the schedule can be adjusted to preserve that relationship.",
  "Tex. Fam. Code § 156.006(b): a temporary order changing who designates the child's " +
    "primary residence during a pending modification is available only on a narrow showing.",
];

const STANDING_CAVEATS: readonly string[] = [
  "Do not act on a general description of what Texas orders 'usually' say. Restrictions " +
    "vary between a single county, a county plus contiguous counties, a school district, " +
    "and the whole state, and the difference decides the case.",
  "Moving in violation of a geographic restriction risks a motion to enforce, a change of " +
    "the right to designate primary residence, and attorney's fees.",
  "A relocation dispute is contested litigation over where a child lives. This is a matter " +
    "for a lawyer, not for a self-help packet.",
];

/**
 * Reports what can be determined from the facts given, and what cannot.
 *
 * It never concludes that a proposed move is permitted or prohibited. That
 * conclusion requires reading the order's exact words against a specific
 * destination, which is legal judgment this package does not offer.
 */
export function analyzeGeographicRestriction(
  facts: GeographicRestrictionFacts,
): RelocationAnalysis {
  const needed: string[] = [];

  if (facts.exists === "unknown") {
    return {
      determination: "restriction_status_unknown",
      summary:
        "Whether the order restricts where the child may live is unknown, and it is the " +
        "first thing that has to be settled. Read the order's conservatorship section, " +
        "which follows the designation of who has the exclusive right to determine the " +
        "child's primary residence.",
      needed: [
        "Whether the order contains a geographic restriction",
        "The restriction's exact wording, if there is one",
      ],
      legalFramework: FRAMEWORK,
      nextSteps: [
        "Find the paragraph naming who has the exclusive right to determine the child's " +
          "primary residence. The restriction, if any, appears with it.",
        "If the order cannot be found, request a certified copy from the district clerk " +
          "in the county where it was signed.",
      ],
      caveats: STANDING_CAVEATS,
    };
  }

  if (facts.exists === "no") {
    return {
      determination: "no_restriction_reported",
      summary:
        "You report that the order contains no geographic restriction. If that is right, " +
        "the conservator with the exclusive right to determine primary residence may " +
        "generally move without first getting permission. The other parent can still file " +
        "to modify, and a move that damages the child's relationship with them is a " +
        "material change a court may act on.",
      needed: [
        "Confirmation, from the order's own words, that no restriction appears anywhere in it",
      ],
      legalFramework: FRAMEWORK,
      nextSteps: [
        "Re-read the order specifically for the phrase 'without regard to geographic location' " +
          "or a named county or area. Restrictions are sometimes stated in the possession " +
          "section rather than the conservatorship section.",
        "Check whether the order requires written notice of a change of residence and how " +
          "many days of notice. That obligation survives even with no restriction.",
        "Have a lawyer read the order before you move. The cost of a consultation is far " +
          "below the cost of an enforcement action.",
      ],
      caveats: STANDING_CAVEATS,
    };
  }

  if (facts.areaVerbatim === undefined || facts.areaVerbatim.trim().length === 0) {
    needed.push("The restriction's exact wording, copied from the order");
  }
  if (facts.proposedDestination === undefined) {
    needed.push("Where you propose to move");
  }
  if (facts.appliesTo === undefined || facts.appliesTo === "unknown") {
    needed.push("Who the restriction binds: the primary conservator only, or both parents");
  }

  if (needed.length > 0) {
    return {
      determination: "requires_order_language",
      summary:
        "There is a geographic restriction, so the move turns on its exact words. I will " +
        "not guess at them. Restrictions range from a single county to the whole state, " +
        "and the same proposed move is permitted under one and prohibited under another.",
      needed,
      legalFramework: FRAMEWORK,
      nextSteps: [
        "Copy the restriction sentence out of the order word for word, including any list " +
          "of counties and any condition attached to it.",
        "Note any exception, such as a clause lifting the restriction if the other parent " +
          "moves out of the area first. Those clauses are common and are often missed.",
      ],
      caveats: STANDING_CAVEATS,
    };
  }

  return {
    determination: "requires_legal_judgment",
    summary:
      `The order restricts the child's residence to: "${facts.areaVerbatim}". You propose ` +
      `moving to ${facts.proposedDestination}. Whether that destination falls inside those ` +
      "words, and what to do if it does not, is legal judgment about your specific order " +
      "and I do not make that call. What I can tell you is the framework a court applies " +
      `and what you would have to prove.${
        facts.seeksToModifyRestriction === true
          ? " Because you are asking to change the restriction itself, this is a modification " +
            "suit under § 156.101, not a question of compliance."
          : ""
      }`,
    needed: [],
    legalFramework: FRAMEWORK,
    nextSteps: [
      "Take the order to a family lawyer with the destination and your reasons for the move. " +
        "This is the single most consequential question in a modification suit.",
      "If the move is agreed, the agreement must be put into a modified order. An informal " +
        "agreement to relax a restriction is unenforceable and leaves you exposed.",
      "If the move is contested, expect to prove a material and substantial change and that " +
        "the move serves the child's best interest under the Lenz factors, not merely that " +
        "it suits you.",
      ...(facts.exceptionsVerbatim === undefined
        ? [
            "Check the order for an exception that lifts the restriction on a condition, " +
              "such as the other parent relocating first.",
          ]
        : []),
    ],
    caveats: STANDING_CAVEATS,
  };
}
