/**
 * Texas Standard Possession Order schedule generation
 * (Tex. Fam. Code §§ 153.3101–153.317).
 *
 * The statute defines most boundaries by reference to the child's school
 * calendar ("the day the child is dismissed from school"). Because that
 * calendar differs by district — Spring ISD, Klein ISD, and Conroe ISD all
 * serve the Spring area — every school-dependent boundary is emitted with
 * `schoolDependent: true` and a default clock time, so the agent can tell the
 * user which dates must be confirmed against their district calendar.
 */
import type { IsoDate } from "./dates.ts";
/** Which parent a possession period belongs to. */
export type Parent = "possessory" | "custodial";
export interface PossessionPeriod {
    readonly label: string;
    readonly parent: Parent;
    readonly start: IsoDate;
    /** Wall-clock start in the court's locale, 24-hour. */
    readonly startTime: string;
    readonly end: IsoDate;
    readonly endTime: string;
    readonly statutoryBasis: string;
    /** `true` when the real boundary is a school dismissal or resumption time. */
    readonly schoolDependent: boolean;
    readonly note?: string;
}
export interface PossessionOptions {
    /** Distance between the residences, which selects the statutory schedule. */
    readonly distanceMiles: number;
    /**
     * Possessory conservator elected expanded possession under § 153.3171
     * (pickup at school dismissal, return when school resumes).
     */
    readonly expandedElection?: boolean;
    /** Which parent is the possessory conservator, for Mother's/Father's Day. */
    readonly possessoryParentRole?: "mother" | "father";
    /** Approximate school-year bounds, used to gate Thursday periods. */
    readonly schoolYear?: {
        readonly firstDay: IsoDate;
        readonly lastDay: IsoDate;
    };
}
export interface PossessionSchedule {
    readonly scheduleType: "standard" | "long-distance";
    readonly periods: readonly PossessionPeriod[];
    readonly statutoryBasis: readonly string[];
    readonly caveats: readonly string[];
}
/** Over this distance the § 153.313 alternate schedule applies. */
export declare const LONG_DISTANCE_THRESHOLD_MILES = 100;
/** Builds the possession calendar for a date range. */
export declare function generatePossessionSchedule(from: IsoDate, to: IsoDate, options: PossessionOptions): PossessionSchedule;
/** Convenience: the next `count` possession periods on or after `from`. */
export declare function nextPossessionPeriods(from: IsoDate, count: number, options: PossessionOptions): readonly PossessionPeriod[];
/** Exported for tests: the first Monday after a given date. */
export declare const mondayAfter: (value: IsoDate) => IsoDate;
