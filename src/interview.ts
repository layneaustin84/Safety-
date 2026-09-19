/**
 * The agent's model of its own state.
 *
 * Two questions this module answers, both of which the agent can only answer
 * about itself: what do I know about this user's matter, and what can I
 * actually do for them right now. Without it the agent is purely reactive — it
 * waits to be asked, and it cannot tell the user that one missing fact is the
 * only thing standing between them and a real answer.
 *
 * The capability specs below are the single source of truth for "what unlocks
 * what". The tools consume them, the interview questions are derived from them,
 * and the self-description reports them, so the three can never disagree.
 */

import type { CaseFile } from "./caseFile.ts";
import { VERIFIED_AS_OF } from "./data/courts.ts";
import { STATUTES } from "./data/statutes.ts";
import { capFor } from "./domain/childSupport.ts";
import { parseIsoDate, today } from "./domain/dates.ts";
import { needsVerification, type Provenance } from "./provenance.ts";

export type MatterType = NonNullable<CaseFile["matterType"]>;

export type CapabilityId =
  | "venue"
  | "child_support"
  | "possession_schedule"
  | "case_deadlines"
  | "modification_analysis"
  | "relocation_analysis"
  | "forms_and_referrals";

/** A fact the agent needs, phrased as the question it would ask to get it. */
export interface FactRequirement {
  readonly field: keyof Omit<CaseFile, "notes">;
  readonly question: string;
  readonly why: string;
  /** Matter types this question applies to; omitted means all of them. */
  readonly appliesTo?: readonly MatterType[];
  /** Lower asks sooner. Safety and venue come before arithmetic. */
  readonly priority: number;
}

export interface CapabilitySpec {
  readonly id: CapabilityId;
  readonly label: string;
  readonly requires: readonly (keyof Omit<CaseFile, "notes">)[];
  /** Any one of these satisfies the capability, in addition to `requires`. */
  readonly requiresAnyOf?: readonly (keyof Omit<CaseFile, "notes">)[];
  readonly appliesTo?: readonly MatterType[];
}

export const CAPABILITIES: readonly CapabilitySpec[] = [
  {
    id: "venue",
    label: "Tell you which county and courts your case belongs in",
    requires: ["zip"],
  },
  {
    id: "child_support",
    label: "Calculate guideline child support",
    requires: ["monthlyNetResourcesUsd", "childrenCount"],
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
  },
  {
    id: "possession_schedule",
    label: "Build your possession and visitation calendar",
    requires: ["childrenCount", "distanceBetweenHomesMiles"],
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
  },
  {
    id: "case_deadlines",
    label: "Compute the deadlines running in your case",
    requires: [],
    requiresAnyOf: ["petitionFiledOn", "servedOn", "priorOrderSignedOn"],
  },
  {
    id: "modification_analysis",
    label: "Assess whether your order is eligible for modification",
    requires: ["priorOrderSignedOn"],
    appliesTo: ["modification"],
  },
  {
    id: "relocation_analysis",
    label: "Work through a move and any geographic restriction on the children",
    requires: ["geographicRestrictionExists", "proposedRelocationDestination"],
    appliesTo: ["modification", "enforcement", "divorce", "sapcr"],
  },
  {
    id: "forms_and_referrals",
    label: "Point you at the right court forms and free legal help",
    requires: ["matterType"],
  },
];

export const FACT_REQUIREMENTS: readonly FactRequirement[] = [
  {
    field: "safetyConcernRaised",
    question:
      "Before anything else: is anyone in the household in danger right now, or has there been any violence or threats?",
    why:
      "Safety changes the whole plan. It also waives the 60-day divorce waiting period " +
      "and rebuts the presumption of joint managing conservatorship.",
    priority: 0,
  },
  {
    field: "matterType",
    question:
      "What are you trying to do — get divorced, set up custody and support for the first time, change an existing order, or enforce one that is being ignored?",
    why: "It decides which statute, which forms, and which deadlines apply.",
    priority: 1,
  },
  {
    field: "zip",
    question: "What is your ZIP code?",
    why:
      "Spring straddles the Harris and Montgomery county line, and filing in the wrong " +
      "county wastes the filing fee.",
    priority: 2,
  },
  {
    field: "hasExistingOrder",
    question: "Is there already a signed court order in place for these children?",
    why:
      "A signed order controls over anything the statute says by default, so this changes " +
      "every answer that follows.",
    priority: 3,
  },
  {
    field: "childrenCount",
    question: "How many children are involved?",
    why: "It sets the guideline support percentage and whether a SAPCR is needed at all.",
    priority: 4,
  },
  {
    field: "texasResidentSixMonths",
    question: "Have you lived in Texas for at least the last six months?",
    why: "Section 6.301 requires it before a Texas court can grant a divorce.",
    appliesTo: ["divorce"],
    priority: 5,
  },
  {
    field: "countyResidentNinetyDays",
    question: "Have you lived in your county for at least the last 90 days?",
    why: "Section 6.301 requires this too, separately from the six-month state requirement.",
    appliesTo: ["divorce"],
    priority: 5,
  },
  {
    field: "paternityEstablished",
    question:
      "Has legal fatherhood been established, either by signing an Acknowledgment of Paternity or by a court order?",
    why:
      "Without it the suit has to adjudicate parentage under chapter 160 before it can " +
      "order custody or support.",
    appliesTo: ["sapcr"],
    priority: 5,
  },
  {
    field: "monthlyNetResourcesUsd",
    question:
      "What are the paying parent's monthly net resources — take-home pay after Social Security and income tax, union dues, and the children's health and dental premiums?",
    why: "It is the base the guideline percentage applies to.",
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
    priority: 6,
  },
  {
    field: "otherChildrenSupported",
    question: "Does the paying parent support any other children outside this case?",
    why: "It switches the calculation to the lower multiple-household table in § 154.129.",
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
    priority: 7,
  },
  {
    field: "distanceBetweenHomesMiles",
    question: "Roughly how many miles apart do the two parents live?",
    why:
      "Over 100 miles the possession schedule changes completely: monthly weekends, every " +
      "spring break, and 42 summer days instead of 30.",
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
    priority: 7,
  },
  {
    field: "childrenUnderThree",
    question: "Is any child under three years old?",
    why:
      "The standard possession order does not presumptively apply to a child under three; " +
      "§ 153.254 governs instead.",
    appliesTo: ["divorce", "sapcr", "modification"],
    priority: 8,
  },
  {
    field: "priorOrderSignedOn",
    question: "What date was the current order signed?",
    why:
      "Modification turns on it: a support order at least three years old has its own " +
      "ground, and a change within one year of the order needs a supporting affidavit.",
    appliesTo: ["modification", "enforcement"],
    priority: 8,
  },
  {
    field: "geographicRestrictionExists",
    question:
      "Does your order limit where the children may live — a named county, a school district, or anything like that?",
    why:
      "Texas has no relocation statute, so a move is governed by whatever your order " +
      "actually says. I will not assume the usual wording, because orders differ.",
    appliesTo: ["modification", "enforcement"],
    priority: 8,
  },
  {
    field: "geographicRestrictionAreaVerbatim",
    question:
      "Copy the restriction out of the order word for word, including any counties it lists. What does it say exactly?",
    why:
      "The same proposed move is permitted under one wording and prohibited under another. " +
      "A paraphrase is not enough to work from.",
    appliesTo: ["modification", "enforcement"],
    priority: 9,
  },
  {
    field: "geographicRestrictionAppliesTo",
    question: "Does that restriction bind only the parent with primary custody, or both parents?",
    why: "It decides whether the other parent's own move is constrained or free.",
    appliesTo: ["modification", "enforcement"],
    priority: 9,
  },
  {
    field: "geographicRestrictionExceptionsVerbatim",
    question:
      "Does the order attach any condition that lifts the restriction, such as it ending if the other parent moves away first?",
    why:
      "These clauses are common and easy to miss, and one of them can decide the question " +
      "without any suit at all.",
    appliesTo: ["modification", "enforcement"],
    priority: 10,
  },
  {
    field: "proposedRelocationDestination",
    question: "Where are you proposing to move?",
    why: "Nothing about a move can be assessed without the destination.",
    appliesTo: ["modification", "enforcement"],
    priority: 10,
  },
  {
    field: "petitionFiledOn",
    question: "What date was the petition filed?",
    why: "It starts the 60-day divorce waiting period and the court's dismissal clock.",
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
    priority: 9,
  },
  {
    field: "servedOn",
    question: "What date was the other party served with the citation?",
    why: "The answer deadline counts from it under Rule 99(b).",
    appliesTo: ["divorce", "sapcr", "modification", "enforcement"],
    priority: 9,
  },
];

export type CapabilityState = "ready" | "requires_verification" | "blocked";

export interface CapabilityStatus {
  readonly id: CapabilityId;
  readonly label: string;
  readonly state: CapabilityState;
  /** Facts still needed. Empty unless `state` is `blocked`. */
  readonly missing: readonly string[];
  /** Reference data this capability rests on, when any of it is unconfirmed. */
  readonly verification?: readonly Provenance[];
}

export interface Assessment {
  readonly known: Readonly<Record<string, unknown>>;
  readonly completeness: number;
  /** Ordered: ask the first one next. */
  readonly openQuestions: readonly FactRequirement[];
  readonly ready: readonly CapabilityStatus[];
  /**
   * Has every fact it needs, but rests on reference data this package could not
   * confirm. The agent must say so before giving a number from it.
   */
  readonly requiresVerification: readonly CapabilityStatus[];
  readonly blocked: readonly CapabilityStatus[];
  readonly suggestedNextQuestion?: string;
}

function isKnown(caseFile: CaseFile, field: keyof Omit<CaseFile, "notes">): boolean {
  const value = caseFile[field];
  if (value === undefined) return false;
  if (field === "county" && value === "unknown") return false;
  return true;
}

function relevant(
  appliesTo: readonly MatterType[] | undefined,
  matterType: MatterType | undefined,
): boolean {
  if (appliesTo === undefined) return true;
  // Before the matter type is known, keep everything in view rather than
  // silently dropping questions the user may well need.
  if (matterType === undefined) return true;
  return appliesTo.includes(matterType);
}

/**
 * Reference data each capability depends on. A capability whose data is
 * unconfirmed cannot report `ready`, however complete the case file is.
 */
function dependenciesOf(spec: CapabilitySpec): readonly Provenance[] {
  if (spec.id !== "child_support") return [];
  return [capFor(parseIsoDate(today())).provenance];
}

function statusFor(spec: CapabilitySpec, caseFile: CaseFile): CapabilityStatus {
  const missing = spec.requires.filter((field) => !isKnown(caseFile, field));
  const anyOf = spec.requiresAnyOf;
  if (anyOf !== undefined && !anyOf.some((field) => isKnown(caseFile, field))) {
    missing.push(...anyOf);
  }

  const unconfirmed = dependenciesOf(spec).filter(needsVerification);
  const state: CapabilityState =
    missing.length > 0 ? "blocked" : unconfirmed.length > 0 ? "requires_verification" : "ready";

  return {
    id: spec.id,
    label: spec.label,
    state,
    missing: state === "blocked" ? [...new Set(missing)] : [],
    ...(unconfirmed.length > 0 ? { verification: unconfirmed } : {}),
  };
}

/** Builds the agent's picture of what it knows, needs, and can do right now. */
export function assessCaseFile(caseFile: CaseFile): Assessment {
  const matterType = caseFile.matterType;

  const applicable = FACT_REQUIREMENTS.filter((r) => relevant(r.appliesTo, matterType));
  const openQuestions = applicable
    .filter((r) => !isKnown(caseFile, r.field))
    .sort((a, b) => a.priority - b.priority);

  const statuses = CAPABILITIES.filter((c) => relevant(c.appliesTo, matterType)).map((c) =>
    statusFor(c, caseFile),
  );

  const answered = applicable.length - openQuestions.length;
  const completeness =
    applicable.length === 0 ? 1 : Math.round((answered / applicable.length) * 100) / 100;

  const next = openQuestions[0];
  return {
    known: Object.fromEntries(
      Object.entries(caseFile).filter(
        ([key, value]) =>
          value !== undefined && !(key === "county" && value === "unknown") && key !== "notes",
      ),
    ),
    completeness,
    openQuestions,
    ready: statuses.filter((s) => s.state === "ready"),
    requiresVerification: statuses.filter((s) => s.state === "requires_verification"),
    blocked: statuses.filter((s) => s.state === "blocked"),
    ...(next === undefined ? {} : { suggestedNextQuestion: next.question }),
  };
}

export interface SelfDescription {
  readonly identity: string;
  readonly capabilities: readonly string[];
  readonly knowledgeSources: readonly { readonly source: string; readonly scope: string }[];
  readonly knownLimits: readonly string[];
  readonly willNotDo: readonly string[];
}

/**
 * What the agent can say about itself when asked directly. Honest about
 * provenance and gaps, because a user deciding whether to trust a number needs
 * to know where it came from and when it was last checked.
 */
export function describeSelf(): SelfDescription {
  return {
    identity:
      "A legal information assistant for the Texas family court system, scoped to the " +
      "Spring area in Harris and Montgomery counties. Not a lawyer, and not a " +
      "substitute for one.",
    capabilities: CAPABILITIES.map((c) => c.label),
    knowledgeSources: [
      {
        source: "Texas Family Code, curated subset",
        scope: `${STATUTES.length} provisions covering divorce, conservatorship, possession, support, modification, enforcement, and protective orders. Anything outside this set is not in my knowledge base and I will say so rather than cite from memory.`,
      },
      {
        source: "Texas Rules of Civil and Appellate Procedure",
        scope:
          "The deadline rules only: Rule 4 computation, Rule 99(b) answer date, Rule 194 " +
          "disclosures, Rule 329b post-judgment, Rule 216 jury demand, TRAP 26.1 appeal.",
      },
      {
        source: "Harris and Montgomery county court directory",
        scope: `Courts, clerks, addresses, and the Spring ZIP-to-county table. Last reviewed ${VERIFIED_AS_OF}; court numbers and addresses drift without notice.`,
      },
      {
        source: "Calculators I run myself",
        scope:
          "Guideline child support, possession calendars, and deadlines are computed by " +
          "tested code, not recalled. That is why I ask for specific numbers before answering.",
      },
    ],
    knownLimits: [
      "The child support cap is a dated table carrying a verification status. The " +
        "inflation adjustment due September 1, 2025 is marked unverified, so every " +
        "support calculation reports 'requires verification' rather than 'ready' until " +
        "the current figure is confirmed with the Attorney General. That downgrade is " +
        "automatic; it does not depend on me remembering to mention it.",
      "Geographic restrictions are order-specific. I will not assume a standard Texas " +
        "restriction, and I cannot decide whether a move complies with yours.",
      "Possession dates tied to school dismissal are placeholders. Three districts serve " +
        "Spring and their calendars differ.",
      "I do not compute net resources from gross pay. That needs tax facts I do not collect.",
      "I have no access to your actual case file, the court's docket, or anything you " +
        "have filed. Everything I know is what you tell me in this session.",
      "I do not carry memory between sessions. Closing this conversation clears the facts.",
      "The standard possession order does not cover children under three, and I do not " +
        "build that alternate schedule.",
    ],
    willNotDo: [
      "Tell you what you should do in your case, or predict how a judge will rule.",
      "Draft a pleading, affidavit, or proposed order for you to file.",
      "Help hide assets, conceal income, evade service, or take a child against an order.",
      "Replace a lawyer where conservatorship is contested, violence is involved, there " +
        "is a business or retirement account in play, or anyone faces jail.",
    ],
  };
}
