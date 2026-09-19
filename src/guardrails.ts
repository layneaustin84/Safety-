/**
 * Safety and scope guardrails.
 *
 * Two jobs, both of which must run before the model sees a turn:
 *
 *  1. Screen for immediate danger. Family law and family violence overlap
 *     constantly, and a schedule question can carry a safety emergency inside
 *     it. When the screen fires, the agent leads with resources.
 *  2. Hold the unauthorized-practice-of-law line. This package produces legal
 *     information, not advice, and never files anything.
 */

export type RiskCategory = "family_violence" | "self_harm" | "child_safety" | "abduction";

export interface RiskSignal {
  readonly category: RiskCategory;
  readonly matched: readonly string[];
  readonly directive: string;
}

interface Rule {
  readonly category: RiskCategory;
  readonly patterns: readonly RegExp[];
  readonly directive: string;
}

const RULES: readonly Rule[] = [
  {
    category: "self_harm",
    patterns: [
      /\bkill myself\b/i,
      /\bsuicid/i,
      /\bend my life\b/i,
      /\bdon'?t want to (?:be alive|live)\b/i,
    ],
    directive:
      "The user may be at risk of self-harm. Before anything else, respond with warmth, " +
      "state plainly that help is available, and give the 988 Suicide and Crisis Lifeline " +
      "(call or text 988). Do not lead with legal procedure. Answer the legal question " +
      "afterward only if the user still wants it.",
  },
  {
    category: "family_violence",
    patterns: [
      /\b(?:he|she|they|husband|wife|partner|ex)\s+(?:hit|beat|choked|strangled|punched|assaulted)\b/i,
      /\bdomestic (?:violence|abuse)\b/i,
      /\bfamily violence\b/i,
      /\bafraid (?:of|for) my (?:life|safety)\b/i,
      /\bthreatened to kill\b/i,
      /\bprotective order\b/i,
      /\brestraining order\b.*\b(?:abuse|violence|hurt)\b/i,
    ],
    directive:
      "The user has described possible family violence. Lead with safety: the National " +
      "Domestic Violence Hotline at 1-800-799-7233 (text START to 88788), 911 for an " +
      "emergency in progress, and the local shelters in this package's referral list. " +
      "Then explain the protective order process under Tex. Fam. Code chapters 81 through " +
      "85, including the temporary ex parte order, and note that the district attorney's " +
      "protective order division files these at no cost. Also tell the user that a " +
      "family-violence finding waives the 60-day divorce waiting period under § 6.702(c) " +
      "and rebuts the joint managing conservatorship presumption under § 153.131.",
  },
  {
    category: "child_safety",
    patterns: [
      /\b(?:child|kid|son|daughter)\b[^.?!]{0,60}\b(?:abused|molested|beaten|hurt by|neglected)\b/i,
      /\bCPS\b/,
      /\bchild protective services\b/i,
    ],
    directive:
      "The user has raised possible child abuse or neglect. Give the Texas Abuse Hotline " +
      "(1-800-252-5400, or txabusehotline.org) and 911 for immediate danger. Explain that " +
      "a CPS investigation runs on its own track from the family case, and that anything " +
      "said to an investigator can appear in the family case. Recommend a lawyer before " +
      "speaking with investigators.",
  },
  {
    category: "abduction",
    patterns: [
      /\b(?:took|taking|kept|keeping) (?:the|my) (?:child|kids|children|son|daughter)\b[^.?!]{0,40}\b(?:out of state|to mexico|overseas|won'?t return|refuses to return)\b/i,
      /\bparental (?:kidnapping|abduction)\b/i,
      /\bwon'?t bring (?:him|her|them|the kids?) back\b/i,
    ],
    directive:
      "The user may be describing an interference with child custody or an abduction risk. " +
      "Point to law enforcement and to a writ of habeas corpus or a motion to enforce under " +
      "Tex. Fam. Code chapter 157, and note that interference with child custody is a crime " +
      "under Tex. Penal Code § 25.03. Urge immediate contact with a lawyer; the remedies " +
      "here are time-sensitive.",
  },
];

export function screenForRisk(text: string): readonly RiskSignal[] {
  const signals: RiskSignal[] = [];
  for (const rule of RULES) {
    const matched = rule.patterns
      .map((pattern) => pattern.exec(text)?.[0])
      .filter((match): match is string => match !== undefined);
    if (matched.length > 0) {
      signals.push({ category: rule.category, matched, directive: rule.directive });
    }
  }
  return signals;
}

/**
 * Builds the operator directive injected as a mid-conversation system message
 * when a screen fires. Returns `undefined` when nothing matched, so the cached
 * prompt prefix is left untouched on ordinary turns.
 */
export function riskDirective(text: string): string | undefined {
  const signals = screenForRisk(text);
  if (signals.length === 0) return undefined;
  return [
    "SAFETY SCREEN TRIGGERED. Apply the following before answering the legal question:",
    ...signals.map((s) => `- [${s.category}] ${s.directive}`),
  ].join("\n");
}

/** The standing scope disclosure, shown once per session and on request. */
export const SCOPE_DISCLOSURE = `This assistant provides legal *information* about the Texas family court system for the Spring, Texas area. It is not a lawyer, it cannot give legal advice about your specific case, and using it creates no attorney-client relationship and no confidentiality or privilege. It does not file documents, sign pleadings, appear in court, or calculate the final number a judge will order. Court rules, dollar thresholds, and court assignments change; verify everything against the official source before you rely on it. For advice about your case, consult a licensed Texas attorney.`;
