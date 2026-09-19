/**
 * Texas guideline child support (Tex. Fam. Code ch. 154).
 *
 * This module implements the *guideline* calculation only. Courts may vary from
 * guideline support on the § 154.123 factors, and the § 154.062 net-resources
 * deductions require tax facts this calculator only approximates. Every result
 * therefore carries explicit caveats for the agent to surface.
 */
import { compareDates } from "./dates.js";
export const NET_RESOURCES_CAPS = [
    {
        effective: "2013-09-01",
        monthlyCapUsd: 8550,
        verified: true,
        note: "Superseded.",
    },
    {
        effective: "2019-09-01",
        monthlyCapUsd: 9200,
        verified: true,
        note: "Published by the Texas Attorney General effective September 1, 2019.",
    },
    {
        effective: "2025-09-01",
        monthlyCapUsd: 9200,
        verified: false,
        note: "A six-year inflation adjustment was due September 1, 2025. This package " +
            "could not verify the published figure, so it carries the prior cap " +
            "forward. Confirm the current cap at texasattorneygeneral.gov before " +
            "relying on this amount.",
    },
];
/** Guideline percentages, § 154.125(b), for obligors at or above the low-income floor. */
const STANDARD_PERCENTAGES = [0.2, 0.25, 0.3, 0.35, 0.4];
/** Reduced schedule, § 154.125(b), for monthly net resources under the low-income floor. */
const LOW_INCOME_PERCENTAGES = [0.15, 0.2, 0.25, 0.3, 0.35];
/** The § 154.125(b) low-income floor. */
export const LOW_INCOME_MONTHLY_FLOOR_USD = 1000;
/**
 * § 154.129 multiple-household table, indexed as
 * `[childrenBeforeTheCourt - 1][otherChildren]`, expressed as percentages.
 */
const MULTIPLE_HOUSEHOLD_TABLE = [
    [20.0, 17.5, 16.0, 14.75, 13.6, 13.33, 13.14],
    [25.0, 22.5, 20.63, 19.0, 18.33, 17.86, 17.5],
    [30.0, 27.38, 25.2, 24.0, 23.14, 22.5, 22.0],
    [35.0, 32.2, 30.33, 29.0, 28.0, 27.22, 26.6],
    [40.0, 37.33, 35.43, 34.0, 32.89, 32.0, 31.27],
    [40.0, 37.71, 36.0, 34.67, 33.6, 32.73, 32.0],
    [40.0, 38.0, 36.44, 35.2, 34.18, 33.33, 32.62],
];
export class ChildSupportInputError extends Error {
    constructor(message) {
        super(message);
        this.name = "ChildSupportInputError";
    }
}
/** The cap in force on `asOf`. */
export function capFor(asOf) {
    const applicable = NET_RESOURCES_CAPS.filter((c) => compareDates(c.effective, asOf) <= 0);
    const latest = applicable.at(-1) ?? NET_RESOURCES_CAPS[0];
    if (latest === undefined)
        throw new Error("Net-resources cap table is empty.");
    return latest;
}
function roundCents(value) {
    return Math.round(value * 100) / 100;
}
/**
 * Computes guideline monthly child support.
 *
 * Order of operations follows the statute: cap the net resources first
 * (§ 154.125(a)), then apply the percentage for the number of children, using
 * the § 154.129 table when the obligor supports children in another household.
 */
export function calculateGuidelineChildSupport(input) {
    const { monthlyNetResourcesUsd, childrenBeforeCourt, asOf } = input;
    const otherChildren = input.otherChildrenSupported ?? 0;
    if (!Number.isFinite(monthlyNetResourcesUsd) || monthlyNetResourcesUsd < 0) {
        throw new ChildSupportInputError("monthlyNetResourcesUsd must be a non-negative number.");
    }
    if (!Number.isInteger(childrenBeforeCourt) || childrenBeforeCourt < 1) {
        throw new ChildSupportInputError("childrenBeforeCourt must be an integer of at least 1.");
    }
    if (!Number.isInteger(otherChildren) || otherChildren < 0) {
        throw new ChildSupportInputError("otherChildrenSupported must be a non-negative integer.");
    }
    const cap = capFor(asOf);
    const capApplied = monthlyNetResourcesUsd > cap.monthlyCapUsd;
    const cappedNetResources = Math.min(monthlyNetResourcesUsd, cap.monthlyCapUsd);
    const caveats = [];
    const statutoryBasis = ["Tex. Fam. Code § 154.125"];
    let percentage;
    let scheduleUsed;
    if (otherChildren > 0) {
        scheduleUsed = "multiple-household";
        statutoryBasis.push("Tex. Fam. Code § 154.128", "Tex. Fam. Code § 154.129");
        // The published table stops at 7 children in each column; clamp and warn.
        const rowIndex = Math.min(childrenBeforeCourt, MULTIPLE_HOUSEHOLD_TABLE.length) - 1;
        const row = MULTIPLE_HOUSEHOLD_TABLE[rowIndex];
        if (row === undefined)
            throw new Error("Multiple-household table row missing.");
        const columnIndex = Math.min(otherChildren, row.length - 1);
        const cell = row[columnIndex];
        if (cell === undefined)
            throw new Error("Multiple-household table cell missing.");
        percentage = cell / 100;
        if (childrenBeforeCourt > MULTIPLE_HOUSEHOLD_TABLE.length || otherChildren > row.length - 1) {
            caveats.push("The § 154.129 table is published only through seven children per column. " +
                "The calculation clamped to the last published row or column; a court " +
                "would apply § 154.128 directly instead.");
        }
    }
    else if (monthlyNetResourcesUsd < LOW_INCOME_MONTHLY_FLOOR_USD) {
        scheduleUsed = "low-income";
        const index = Math.min(childrenBeforeCourt, LOW_INCOME_PERCENTAGES.length) - 1;
        const rate = LOW_INCOME_PERCENTAGES[index];
        if (rate === undefined)
            throw new Error("Low-income percentage missing.");
        percentage = childrenBeforeCourt >= 6 ? 0.35 : rate;
        caveats.push(`Monthly net resources are below the $${LOW_INCOME_MONTHLY_FLOOR_USD} low-income ` +
            "floor, so the reduced § 154.125(b) schedule applies.");
    }
    else {
        scheduleUsed = "standard";
        const index = Math.min(childrenBeforeCourt, STANDARD_PERCENTAGES.length) - 1;
        const rate = STANDARD_PERCENTAGES[index];
        if (rate === undefined)
            throw new Error("Standard percentage missing.");
        // § 154.125(b): six or more children take "not less than" the five-child rate.
        percentage = childrenBeforeCourt >= 6 ? 0.4 : rate;
        if (childrenBeforeCourt >= 6) {
            caveats.push("For six or more children the statute sets a floor of 40%, not a fixed " +
                "rate; the court may order more.");
        }
    }
    if (capApplied) {
        caveats.push(`Net resources exceed the $${cap.monthlyCapUsd.toLocaleString("en-US")} guideline cap. ` +
            "Support above the cap requires proof of the children's proven needs under § 154.126.");
    }
    if (!cap.verified) {
        caveats.push(cap.note);
    }
    caveats.push("Guideline support is a rebuttable presumption. A court may vary from it on " +
        "the § 154.123 factors.", "Medical support and dental support are ordered in addition to this amount " +
        "(§§ 154.182, 154.1825).", "Net resources must be computed under § 154.062, which deducts Social Security " +
        "taxes, federal income tax for a single person with one exemption, state " +
        "income tax, union dues, and the children's health and dental premiums.");
    return {
        monthlyGuidelineSupportUsd: roundCents(cappedNetResources * percentage),
        appliedPercentage: roundCents(percentage * 100),
        cappedNetResourcesUsd: roundCents(cappedNetResources),
        capApplied,
        cap,
        scheduleUsed,
        statutoryBasis,
        caveats,
    };
}
//# sourceMappingURL=childSupport.js.map