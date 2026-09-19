/**
 * A curated Texas Family Code knowledge base.
 *
 * This is deliberately a small, hand-checked set of the provisions that drive
 * most Spring-area family matters, not a full code. Keeping it small means the
 * agent cites provisions this package can stand behind; anything outside the
 * set is answered by telling the user to read the code itself.
 */

export interface StatuteEntry {
  readonly citation: string;
  readonly title: string;
  readonly topics: readonly string[];
  readonly summary: string;
}

export const STATUTES: readonly StatuteEntry[] = [
  {
    citation: "Tex. Fam. Code § 6.301",
    title: "General residency rule for divorce suits",
    topics: ["divorce", "residency", "venue", "jurisdiction", "filing"],
    summary:
      "A divorce suit requires that one spouse has been a domiciliary of Texas for the " +
      "preceding six-month period and a resident of the county of filing for the " +
      "preceding 90-day period.",
  },
  {
    citation: "Tex. Fam. Code § 6.001",
    title: "Insupportability",
    topics: ["divorce", "grounds", "no-fault"],
    summary:
      "The no-fault ground. A court may grant a divorce without regard to fault when the " +
      "marriage has become insupportable because of discord or conflict of personalities " +
      "that destroys the legitimate ends of the marriage and prevents reconciliation.",
  },
  {
    citation: "Tex. Fam. Code §§ 6.002–6.007",
    title: "Fault grounds for divorce",
    topics: ["divorce", "grounds", "fault", "adultery", "cruelty", "abandonment"],
    summary:
      "Cruelty, adultery, conviction of a felony, abandonment for at least one year, " +
      "living apart for at least three years, and confinement in a mental hospital. " +
      "Fault can support a disproportionate division of the community estate.",
  },
  {
    citation: "Tex. Fam. Code § 6.702",
    title: "Sixty-day waiting period",
    topics: ["divorce", "deadline", "waiting period", "timeline"],
    summary:
      "A court may not grant a divorce before the 60th day after the petition is filed. " +
      "The wait is waived where the respondent has a family-violence conviction or " +
      "deferred adjudication against the petitioner or a household member, or where " +
      "the petitioner holds an active protective order against the respondent.",
  },
  {
    citation: "Tex. Fam. Code § 7.001",
    title: "Just and right division",
    topics: ["property", "division", "community property", "divorce"],
    summary:
      "The court divides the community estate in a manner it deems just and right, having " +
      "due regard for the rights of each party and any children. Texas is not a 50/50 " +
      "state; an unequal division is permitted on proof of relevant factors.",
  },
  {
    citation: "Tex. Fam. Code § 3.003",
    title: "Community property presumption",
    topics: ["property", "community property", "separate property", "tracing"],
    summary:
      "Property possessed by either spouse during or on dissolution of marriage is " +
      "presumed community. Separate character must be proved by clear and convincing " +
      "evidence, usually by tracing.",
  },
  {
    citation: "Tex. Fam. Code § 8.051",
    title: "Eligibility for spousal maintenance",
    topics: ["spousal maintenance", "alimony", "support"],
    summary:
      "Maintenance is available where the spouse seeking it lacks sufficient property to " +
      "provide for minimum reasonable needs and either the other spouse was convicted of " +
      "family violence within the statutory window, or the marriage lasted ten years or " +
      "more and the spouse cannot earn sufficient income, or the spouse has an " +
      "incapacitating disability, or is the custodian of a disabled child.",
  },
  {
    citation: "Tex. Fam. Code §§ 8.054–8.055",
    title: "Duration and amount of maintenance",
    topics: ["spousal maintenance", "alimony", "cap", "duration"],
    summary:
      "Duration is capped by the length of the marriage: five years for marriages under " +
      "ten years with family violence or ten to twenty years, seven years for twenty to " +
      "thirty years, and ten years for thirty years or more. The monthly amount may not " +
      "exceed the lesser of $5,000 or 20% of the payor's average monthly gross income.",
  },
  {
    citation: "Tex. Fam. Code § 153.002",
    title: "Best interest of the child",
    topics: ["custody", "conservatorship", "best interest", "children"],
    summary:
      "The best interest of the child is always the primary consideration in determining " +
      "conservatorship, possession, and access. Courts apply the Holley v. Adams factors.",
  },
  {
    citation: "Tex. Fam. Code § 153.131",
    title: "Presumption of joint managing conservatorship",
    topics: ["custody", "conservatorship", "joint managing", "children"],
    summary:
      "Parents are presumed to be appointed joint managing conservators unless that " +
      "appointment would not be in the child's best interest because it would " +
      "significantly impair the child's physical health or emotional development. " +
      "A history of family violence rebuts the presumption.",
  },
  {
    citation: "Tex. Fam. Code § 153.134",
    title: "Rights and duties of joint managing conservators",
    topics: ["custody", "conservatorship", "joint managing", "primary residence"],
    summary:
      "Joint managing conservatorship divides rights and duties between the parents. It " +
      "does not mean equal possession time. The order must designate which conservator " +
      "has the exclusive right to determine the child's primary residence, and usually " +
      "sets a geographic restriction.",
  },
  {
    citation: "Tex. Fam. Code §§ 153.3101–153.317",
    title: "Standard possession order",
    topics: ["possession", "visitation", "schedule", "standard possession order"],
    summary:
      "The statutory default possession schedule. Within 100 miles: the first, third, and " +
      "fifth weekends, Thursdays during the school term, alternating holidays, and 30 " +
      "days in the summer. Beyond 100 miles: one weekend per month or the 1/3/5 schedule " +
      "at the possessory conservator's election, every spring break, and 42 summer days. " +
      "Section 153.3171 lets the possessory conservator elect expanded pickup at school " +
      "dismissal and return when school resumes.",
  },
  {
    citation: "Tex. Fam. Code § 153.254",
    title: "Possession of a child under three",
    topics: ["possession", "infant", "young child", "schedule"],
    summary:
      "The standard possession order does not presumptively apply to a child under three. " +
      "The court fashions a schedule on the statutory factors and states the order that " +
      "takes effect when the child turns three.",
  },
  {
    citation: "Tex. Fam. Code § 154.062",
    title: "Net resources",
    topics: ["child support", "net resources", "income", "calculation"],
    summary:
      "Net resources include wages, self-employment income, rental income, and most other " +
      "receipts, less Social Security taxes, federal income tax for a single person " +
      "claiming one exemption and the standard deduction, state income tax, union dues, " +
      "and the children's health and dental insurance premiums.",
  },
  {
    citation: "Tex. Fam. Code § 154.125",
    title: "Guideline child support percentages and cap",
    topics: ["child support", "guidelines", "percentage", "cap", "calculation"],
    summary:
      "Guideline support applies a percentage to the first tier of monthly net resources: " +
      "20% for one child, rising five points per child to 40% for five or more. A reduced " +
      "schedule applies where monthly net resources fall below $1,000. The cap on net " +
      "resources is adjusted for inflation by the Attorney General every six years.",
  },
  {
    citation: "Tex. Fam. Code §§ 154.128–154.129",
    title: "Support when the obligor has children in another household",
    topics: ["child support", "multiple families", "other children", "calculation"],
    summary:
      "Where the obligor has a duty to support children in more than one household, the " +
      "court applies the alternative percentage table in § 154.129 or computes support " +
      "under the § 154.128 method.",
  },
  {
    citation: "Tex. Fam. Code §§ 154.182, 154.1825",
    title: "Medical and dental support",
    topics: ["child support", "medical support", "dental", "insurance"],
    summary:
      "The court must order medical support and dental support for the child in addition " +
      "to base child support, allocating the cost of coverage between the parents.",
  },
  {
    citation: "Tex. Fam. Code § 153.134(b)(1)",
    title: "Geographic restriction on the child's primary residence",
    topics: [
      "geographic restriction",
      "residency restriction",
      "primary residence",
      "relocation",
      "move",
      "moving",
      "county",
    ],
    summary:
      "A joint managing conservatorship order must either establish a geographic area within " +
      "which the conservator must maintain the child's primary residence, or state that that " +
      "conservator may determine the residence without regard to geographic location. The " +
      "area chosen varies from order to order: a single county, a county plus contiguous " +
      "counties, a school district, or the state. The order's own words control.",
  },
  {
    citation: "Lenz v. Lenz, 79 S.W.3d 10 (Tex. 2002)",
    title: "Relocation: the governing factors",
    topics: ["relocation", "move", "moving", "out of state", "geographic restriction", "custody"],
    summary:
      "Texas has no relocation statute. A move is litigated as a modification, and the court " +
      "weighs the reasons for and against it, the effect on the other parent's relationship " +
      "with the child, whether the move improves the family's circumstances, the child's " +
      "own needs, and whether the possession schedule can be adjusted to preserve the " +
      "relationship. Best interest under § 153.002 remains the controlling standard.",
  },
  {
    citation: "Tex. Fam. Code § 156.006",
    title: "Temporary orders during a modification suit",
    topics: ["modification", "temporary orders", "primary residence", "relocation"],
    summary:
      "A temporary order changing the person with the exclusive right to designate the " +
      "child's primary residence while a modification is pending is available only on a " +
      "narrow showing, such as that the child's present circumstances would significantly " +
      "impair their physical health or emotional development.",
  },
  {
    citation: "Tex. Fam. Code § 156.101",
    title: "Modification of conservatorship, possession, or access",
    topics: ["modification", "custody", "possession", "change in circumstances"],
    summary:
      "Modification requires that the change be in the child's best interest and that the " +
      "circumstances of a child, conservator, or other party have materially and " +
      "substantially changed since the earlier order, or that a child twelve or older has " +
      "told the court their preference, or that the person with the exclusive right to " +
      "designate primary residence has voluntarily relinquished primary care for at least " +
      "six months.",
  },
  {
    citation: "Tex. Fam. Code § 156.102",
    title: "Modification within one year of a prior order",
    topics: ["modification", "primary residence", "affidavit", "one year"],
    summary:
      "A motion to change the person with the exclusive right to designate primary " +
      "residence filed within one year of the prior order must be supported by an " +
      "affidavit alleging that the present environment may endanger the child, or that " +
      "the current designee has voluntarily relinquished primary care and the change is " +
      "in the child's best interest.",
  },
  {
    citation: "Tex. Fam. Code § 156.401",
    title: "Modification of child support",
    topics: ["modification", "child support", "material change", "three years"],
    summary:
      "Support may be modified on a material and substantial change in circumstances, or " +
      "where three years have passed and the guideline amount differs from the ordered " +
      "amount by either 20% or $100.",
  },
  {
    citation: "Tex. Fam. Code ch. 157",
    title: "Enforcement and contempt",
    topics: ["enforcement", "contempt", "arrears", "violation", "motion to enforce"],
    summary:
      "A motion to enforce must state the provision violated, the manner of " +
      "noncompliance, and the relief requested, with each violation pleaded separately. " +
      "Remedies include contempt, confinement, judgment for arrearages, and attorney's " +
      "fees. Affirmative defenses and the right to appointed counsel where confinement " +
      "is sought are addressed in the same chapter.",
  },
  {
    citation: "Tex. Fam. Code chs. 81–85",
    title: "Protective orders for family violence",
    topics: ["protective order", "family violence", "safety", "abuse", "emergency"],
    summary:
      "An application may be filed by an adult member of the household or the prosecutor. " +
      "A temporary ex parte order may issue without notice on a showing of clear and " +
      "present danger and lasts up to 20 days. A final protective order generally lasts " +
      "up to two years and may run longer in aggravated cases.",
  },
  {
    citation: "Tex. Fam. Code ch. 105; Tex. R. Civ. P. 216",
    title: "Jury trials in family cases",
    topics: ["jury", "trial", "procedure"],
    summary:
      "A jury may decide conservatorship and the right to determine primary residence, and " +
      "its verdict on those issues binds the court. A jury may not decide possession " +
      "schedules, child support, or property values in a way that binds the court on " +
      "those issues.",
  },
  {
    citation: "Tex. Fam. Code § 6.602",
    title: "Binding mediated settlement agreements",
    topics: ["mediation", "settlement", "MSA", "agreement"],
    summary:
      "A mediated settlement agreement is binding and not subject to revocation if it " +
      "states in bold, capitalized, or underlined type that it is not subject to " +
      "revocation, is signed by each party, and is signed by each party's attorney if " +
      "present. A party is then entitled to judgment on the agreement.",
  },
];

/** Below this, a hit rests on incidental wording rather than subject matter. */
const MIN_RELEVANCE_SCORE = 3;

export interface StatuteHit extends StatuteEntry {
  readonly score: number;
}

/**
 * Keyword search over the knowledge base.
 *
 * Deliberately a transparent scorer rather than an embedding index: the corpus
 * is small enough that lexical matching is exact and auditable, and it costs no
 * network round trip. Scoring weights topic hits above title hits above body
 * hits, so a query like "child support cap" ranks § 154.125 first.
 */
export function searchStatutes(query: string, limit = 5): readonly StatuteHit[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9§.]+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  // Prefix-at-word-boundary, so "guideline" matches "guidelines" but "claim"
  // does not match mid-word text. Substring matching alone produced false hits
  // (a query about patent claims matched "claiming one exemption").
  const matchers = terms.map(
    (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  );

  const hits: StatuteHit[] = [];
  for (const entry of STATUTES) {
    const topics = entry.topics.join(" ");
    let score = 0;
    for (const matcher of matchers) {
      if (matcher.test(entry.citation)) score += 6;
      if (matcher.test(topics)) score += 4;
      if (matcher.test(entry.title)) score += 3;
      if (matcher.test(entry.summary)) score += 1;
    }
    // A lone incidental body match is noise, not a citation worth giving.
    if (score >= MIN_RELEVANCE_SCORE) hits.push({ ...entry, score });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
