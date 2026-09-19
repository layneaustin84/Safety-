/**
 * Venue and court reference data for the Spring, Texas area.
 *
 * Spring straddles a county line: most of it sits in Harris County, while the
 * eastern and northern edges (including much of 77386 and part of 77389) sit in
 * Montgomery County. County determines which district clerk takes the filing,
 * so the ZIP lookup below is the first question in almost every intake.
 *
 * Court numbers, addresses, and clerk names drift. Every record carries
 * `verifiedAsOf` and a `verifyUrl` so the agent can tell the user what to
 * re-check rather than presenting stale data as current.
 */

export type County = "Harris" | "Montgomery";

export interface CourtRecord {
  readonly county: County;
  readonly name: string;
  readonly kind: "district" | "associate" | "clerk" | "self-help";
  readonly handles: readonly string[];
  readonly address: string;
  readonly verifyUrl: string;
  readonly note?: string;
}

export interface ZipRecord {
  readonly zip: string;
  readonly county: County | "split";
  readonly note: string;
}

/** Last date the records in this module were reviewed against public sources. */
export const VERIFIED_AS_OF = "2026-05-01";

export const SPRING_ZIP_CODES: readonly ZipRecord[] = [
  { zip: "77373", county: "Harris", note: "Old Town Spring and the area east of I-45." },
  { zip: "77379", county: "Harris", note: "Klein area, west of I-45." },
  { zip: "77380", county: "Montgomery", note: "South Woodlands; Spring mailing address." },
  { zip: "77381", county: "Montgomery", note: "The Woodlands; Spring mailing address." },
  { zip: "77382", county: "Montgomery", note: "West Woodlands; Spring mailing address." },
  { zip: "77383", county: "Harris", note: "Post office boxes only." },
  { zip: "77386", county: "Montgomery", note: "Imperial Oaks and Spring Trails." },
  { zip: "77388", county: "Harris", note: "Central Spring, west of I-45." },
  {
    zip: "77389",
    county: "split",
    note:
      "Straddles the county line near Gosling and Rayford. Addresses north of the " +
      "line are Montgomery County; the rest are Harris County. Confirm with the " +
      "county appraisal district before filing.",
  },
  { zip: "77391", county: "Harris", note: "Post office boxes only." },
];

export const COURTS: readonly CourtRecord[] = [
  {
    county: "Harris",
    name: "Harris County Family District Courts (245th, 246th, 247th, 257th, 280th, 308th, 309th, 310th, 311th, 312th)",
    kind: "district",
    handles: ["divorce", "SAPCR", "modification", "enforcement", "adoption", "termination"],
    address: "Harris County Family Law Center, 1115 Congress St., Houston, TX 77002",
    verifyUrl: "https://www.justex.net/",
    note:
      "The 280th is the dedicated domestic-violence court and hears protective order " +
      "applications. Cases are assigned randomly on filing; the assigned court sets " +
      "its own procedures, so read that court's page before the first setting.",
  },
  {
    county: "Harris",
    name: "Harris County District Clerk",
    kind: "clerk",
    handles: ["filing", "service of citation", "case records", "payment of fees"],
    address: "201 Caroline St., Houston, TX 77002",
    verifyUrl: "https://www.hcdistrictclerk.com/",
    note: "E-filing through eFileTexas is mandatory for represented parties and available to self-represented parties.",
  },
  {
    county: "Harris",
    name: "Harris County Law Library self-help resources",
    kind: "self-help",
    handles: ["forms", "legal research", "referrals"],
    address: "1019 Congress St., 1st Floor, Houston, TX 77002",
    verifyUrl: "https://www.harriscountylawlibrary.org/",
  },
  {
    county: "Montgomery",
    name: "Montgomery County District Courts handling family matters (9th, 284th, 359th, 410th, 418th, 435th, 457th)",
    kind: "district",
    handles: ["divorce", "SAPCR", "modification", "enforcement", "protective orders"],
    address: "Montgomery County Courthouse, 301 N. Thompson St., Conroe, TX 77301",
    verifyUrl: "https://www.mctx.org/departments/departments_d_-_f/district_courts/index.php",
    note:
      "Montgomery County assigns family cases across its district courts rather than " +
      "to dedicated family courts. Confirm the assigned court number on the " +
      "file-stamped petition.",
  },
  {
    county: "Montgomery",
    name: "Montgomery County District Clerk",
    kind: "clerk",
    handles: ["filing", "service of citation", "case records", "payment of fees"],
    address: "301 N. Thompson St., Suite 200, Conroe, TX 77301",
    verifyUrl: "https://www.mctx.org/departments/departments_d_-_f/district_clerk/index.php",
  },
  {
    county: "Montgomery",
    name: "Montgomery County Law Library",
    kind: "self-help",
    handles: ["forms", "legal research", "referrals"],
    address: "301 N. Main St., Conroe, TX 77301",
    verifyUrl: "https://www.mctx.org/",
  },
];

export interface VenueAnswer {
  readonly county: County | "split";
  readonly zipNote: string;
  readonly courts: readonly CourtRecord[];
  readonly residencyRule: string;
  readonly verifiedAsOf: string;
  readonly caveats: readonly string[];
}

/** Resolves a Spring-area ZIP to its county and the courts that serve it. */
export function venueForZip(zip: string): VenueAnswer {
  const normalized = zip.trim().slice(0, 5);
  const record = SPRING_ZIP_CODES.find((z) => z.zip === normalized);
  const county = record?.county ?? "split";
  const courts =
    county === "split" ? COURTS : COURTS.filter((c) => c.county === county);

  const caveats = [
    "Court numbers, addresses, and assignments change. Confirm against the " +
      "linked official page before filing anything.",
  ];
  if (record === undefined) {
    caveats.unshift(
      `ZIP ${normalized} is not in this package's Spring-area table. Both counties' ` +
        "courts are listed; confirm the county with the appraisal district or the " +
        "county clerk.",
    );
  }
  if (county === "split") {
    caveats.unshift(
      "This ZIP crosses the Harris/Montgomery county line. Filing in the wrong " +
        "county invites a plea of privilege and wasted filing fees.",
    );
  }

  return {
    county,
    zipNote: record?.note ?? "ZIP not found in the Spring-area table.",
    courts,
    residencyRule:
      "Divorce requires that a spouse has been a Texas domiciliary for the preceding " +
      "six months and a resident of the county for the preceding 90 days " +
      "(Tex. Fam. Code § 6.301). A SAPCR is filed where the child has lived for the " +
      "last six months (Tex. Fam. Code § 103.001).",
    verifiedAsOf: VERIFIED_AS_OF,
    caveats,
  };
}
