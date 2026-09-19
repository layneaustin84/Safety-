/**
 * Deadline computation for Texas family cases.
 *
 * Periods are counted under Tex. R. Civ. P. 4: the day of the triggering event
 * is excluded, the last day is included, and a period ending on a Saturday,
 * Sunday, or legal holiday runs to the next day that is none of those.
 */
import type { IsoDate } from "./dates.ts";
export type TriggerEvent = "petition_filed" | "served_with_citation" | "answer_filed" | "final_decree_signed" | "temporary_restraining_order_signed" | "ex_parte_protective_order_signed" | "trial_setting";
export interface DeadlineInput {
    readonly event: TriggerEvent;
    readonly eventDate: IsoDate;
}
export interface Deadline {
    readonly name: string;
    readonly date: IsoDate;
    /** Wall-clock time when one is fixed by rule, 24-hour. */
    readonly time?: string;
    readonly authority: string;
    readonly description: string;
    readonly rolledForHoliday: boolean;
}
export interface DeadlineResult {
    readonly event: TriggerEvent;
    readonly eventDate: IsoDate;
    readonly deadlines: readonly Deadline[];
    readonly caveats: readonly string[];
}
/** Texas state holidays that close the courts, for the Rule 4 roll-forward. */
export declare function texasLegalHolidays(year: number): readonly IsoDate[];
/** Rolls a date forward to the next day the courts are open (Tex. R. Civ. P. 4). */
export declare function rollForward(value: IsoDate): {
    date: IsoDate;
    rolled: boolean;
};
/**
 * The Rule 99(b) answer date: 10:00 a.m. on the Monday next following the
 * expiration of twenty days after service. The Monday is *strictly* after the
 * twentieth day, so service that puts day 20 on a Monday answers the week after.
 */
export declare function answerDate(serviceDate: IsoDate): IsoDate;
export declare function computeDeadlines(input: DeadlineInput): DeadlineResult;
/** Human-readable one-line rendering, for the CLI and tool output. */
export declare function formatDeadline(deadline: Deadline): string;
