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
export declare const VERIFIED_AS_OF = "2026-05-01";
export declare const SPRING_ZIP_CODES: readonly ZipRecord[];
export declare const COURTS: readonly CourtRecord[];
export interface VenueAnswer {
    readonly county: County | "split";
    readonly zipNote: string;
    readonly courts: readonly CourtRecord[];
    readonly residencyRule: string;
    readonly verifiedAsOf: string;
    readonly caveats: readonly string[];
}
/** Resolves a Spring-area ZIP to its county and the courts that serve it. */
export declare function venueForZip(zip: string): VenueAnswer;
