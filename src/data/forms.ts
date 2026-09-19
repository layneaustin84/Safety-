/**
 * Pro se form packets and referral resources for Texas family matters.
 *
 * The agent never generates a court filing from scratch. It points the user at
 * the Supreme Court of Texas-approved packets on TexasLawHelp, which the
 * district clerks accept, and explains what each packet covers.
 */

export interface FormPacket {
  readonly id: string;
  readonly name: string;
  readonly covers: readonly string[];
  readonly url: string;
  readonly eligibility: string;
  readonly note?: string;
}

export const FORM_PACKETS: readonly FormPacket[] = [
  {
    id: "divorce-no-children",
    name: "Divorce Set 1: no children, no real property",
    covers: ["divorce", "original petition", "final decree", "waiver of service"],
    url: "https://texaslawhelp.org/divorce",
    eligibility:
      "Both spouses agree, there are no children of the marriage under 18 or still in " +
      "high school, the wife is not pregnant, and neither spouse owns real estate.",
  },
  {
    id: "divorce-with-children",
    name: "Divorce Set 3: with children",
    covers: ["divorce", "conservatorship", "child support", "possession schedule"],
    url: "https://texaslawhelp.org/divorce",
    eligibility:
      "Used where there are children of the marriage. Includes the conservatorship, " +
      "possession, child support, and medical and dental support provisions the court " +
      "must address before it can sign a decree.",
    note:
      "A decree involving children must include an income withholding order for support " +
      "and standard health and dental support language, or the court will not sign it.",
  },
  {
    id: "sapcr",
    name: "Custody, visitation, and support order (SAPCR) for unmarried parents",
    covers: ["SAPCR", "custody", "visitation", "child support", "paternity"],
    url: "https://texaslawhelp.org/child-custody-visitation",
    eligibility:
      "Parents who were never married to each other and need a first order establishing " +
      "conservatorship, possession, and support.",
    note:
      "If paternity has not been established by an Acknowledgment of Paternity or a " +
      "prior order, the suit must also adjudicate parentage under chapter 160.",
  },
  {
    id: "modification",
    name: "Modification of an existing custody, visitation, or support order",
    covers: ["modification", "custody", "child support", "possession"],
    url: "https://texaslawhelp.org/modify-custody-visitation-support",
    eligibility:
      "There is a final Texas order and circumstances have materially and substantially " +
      "changed, or the support order is at least three years old and off the guideline " +
      "amount by 20% or $100.",
  },
  {
    id: "enforcement",
    name: "Enforcement of a custody, visitation, or support order",
    covers: ["enforcement", "contempt", "arrears", "denied visitation"],
    url: "https://texaslawhelp.org/enforce-custody-visitation-support-order",
    eligibility:
      "A party has violated a clear and specific provision of an existing order.",
    note:
      "Each violation must be pleaded separately with the date, time, and manner of the " +
      "violation. Vague pleading is the most common reason enforcement motions fail.",
  },
  {
    id: "protective-order",
    name: "Application for a protective order",
    covers: ["protective order", "family violence", "safety"],
    url: "https://texaslawhelp.org/protective-orders",
    eligibility:
      "Family violence has occurred and is likely to occur again. Filed by an adult " +
      "household member, or by the county or district attorney on their behalf.",
    note:
      "Both counties' district attorneys have protective order divisions that file these " +
      "applications at no cost to the applicant.",
  },
  {
    id: "fee-waiver",
    name: "Statement of Inability to Afford Payment of Court Costs",
    covers: ["fee waiver", "filing fees", "indigency"],
    url: "https://texaslawhelp.org/fee-waiver",
    eligibility:
      "The filer receives public benefits, qualifies for free legal aid, or cannot afford " +
      "court costs. Filed with the petition under Tex. R. Civ. P. 145.",
  },
];

export interface ReferralResource {
  readonly name: string;
  readonly serves: string;
  readonly contact: string;
  readonly url: string;
}

export const REFERRALS: readonly ReferralResource[] = [
  {
    name: "Lone Star Legal Aid",
    serves: "Free civil legal help for low-income residents of Harris and Montgomery counties.",
    contact: "1-800-733-8394",
    url: "https://www.lonestarlegal.org/",
  },
  {
    name: "Houston Volunteer Lawyers",
    serves: "Pro bono representation and family law clinics in Harris County.",
    contact: "713-228-0732",
    url: "https://www.makejusticehappen.org/",
  },
  {
    name: "Houston Bar Association Lawyer Referral Service",
    serves: "Referral to a private family lawyer for a reduced-fee initial consultation.",
    contact: "713-237-9429",
    url: "https://www.hba.org/",
  },
  {
    name: "Texas Attorney General Child Support Division",
    serves: "Establishment, modification, and enforcement of child support at no cost.",
    contact: "1-800-252-8014",
    url: "https://www.texasattorneygeneral.gov/child-support",
  },
  {
    name: "National Domestic Violence Hotline",
    serves: "24-hour confidential support and safety planning.",
    contact: "1-800-799-7233, or text START to 88788",
    url: "https://www.thehotline.org/",
  },
  {
    name: "Montgomery County Women's Center",
    serves: "Shelter, advocacy, and protective order assistance in Montgomery County.",
    contact: "1-888-456-1616",
    url: "https://www.mcwctx.org/",
  },
  {
    name: "The Bridge Over Troubled Waters",
    serves: "Domestic violence shelter and advocacy serving the Harris County side of Spring.",
    contact: "713-473-2801",
    url: "https://tbotw.org/",
  },
];

/** Finds packets whose coverage matches a free-text need. */
export function findFormPackets(need: string, limit = 3): readonly FormPacket[] {
  const terms = need.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (terms.length === 0) return FORM_PACKETS.slice(0, limit);

  const scored = FORM_PACKETS.map((packet) => {
    const haystack = `${packet.name} ${packet.covers.join(" ")} ${packet.eligibility}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { packet, score };
  }).filter((entry) => entry.score > 0);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.packet);
}
