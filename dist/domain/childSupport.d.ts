/**
 * Texas guideline child support (Tex. Fam. Code ch. 154).
 *
 * This module implements the *guideline* calculation only. Courts may vary from
 * guideline support on the § 154.123 factors, and the § 154.062 net-resources
 * deductions require tax facts this calculator only approximates. Every result
 * therefore carries explicit caveats for the agent to surface.
 */
import type { IsoDate } from "./dates.ts";
/**
 * The § 154.125(a) cap on net resources to which the guideline percentages
 * apply. The OAG adjusts it for inflation every six years and publishes the new
 * figure in the Texas Register.
 *
 * `verified` marks the entries this package can vouch for. An unverified cap is
 * still used for the math, but the calculator flags it so the caller confirms
 * the current figure against the OAG before relying on a number.
 */
export interface NetResourcesCap {
    readonly effective: IsoDate;
    readonly monthlyCapUsd: number;
    readonly verified: boolean;
    readonly note: string;
}
export declare const NET_RESOURCES_CAPS: readonly NetResourcesCap[];
/** The § 154.125(b) low-income floor. */
export declare const LOW_INCOME_MONTHLY_FLOOR_USD = 1000;
export interface ChildSupportInput {
    /** Obligor's monthly net resources under § 154.062, in dollars. */
    readonly monthlyNetResourcesUsd: number;
    /** Children before the court in this suit. */
    readonly childrenBeforeCourt: number;
    /** Other children the obligor has a legal duty to support. Default 0. */
    readonly otherChildrenSupported?: number;
    /** Date the order is calculated for; selects the applicable cap. */
    readonly asOf: IsoDate;
}
export interface ChildSupportResult {
    readonly monthlyGuidelineSupportUsd: number;
    readonly appliedPercentage: number;
    readonly cappedNetResourcesUsd: number;
    readonly capApplied: boolean;
    readonly cap: NetResourcesCap;
    readonly scheduleUsed: "standard" | "low-income" | "multiple-household";
    readonly statutoryBasis: readonly string[];
    readonly caveats: readonly string[];
}
export declare class ChildSupportInputError extends Error {
    constructor(message: string);
}
/** The cap in force on `asOf`. */
export declare function capFor(asOf: IsoDate): NetResourcesCap;
/**
 * Computes guideline monthly child support.
 *
 * Order of operations follows the statute: cap the net resources first
 * (§ 154.125(a)), then apply the percentage for the number of children, using
 * the § 154.129 table when the obligor supports children in another household.
 */
export declare function calculateGuidelineChildSupport(input: ChildSupportInput): ChildSupportResult;
