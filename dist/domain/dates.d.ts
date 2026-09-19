/**
 * Calendar arithmetic for Texas court scheduling.
 *
 * Design note: every date in this project is a *civil* (wall-clock) date in the
 * America/Chicago court locale. Converting through a real time zone would
 * introduce DST discontinuities into deadline math, where the statutes count
 * whole calendar days. We therefore back every value with a UTC-midnight
 * `Date`, which makes day arithmetic exact, and format manually so no host
 * time zone ever leaks in.
 */
/** ISO `YYYY-MM-DD` calendar date. */
export type IsoDate = string & {
    readonly __brand: "IsoDate";
};
export declare const DAY_MS = 86400000;
/**
 * Days of the week, indexed to match `Date.prototype.getUTCDay()`.
 *
 * A frozen object rather than a TypeScript `enum`, so the source stays
 * erasable and runs under Node's type-stripping without a build step.
 */
export declare const Weekday: {
    readonly Sunday: 0;
    readonly Monday: 1;
    readonly Tuesday: 2;
    readonly Wednesday: 3;
    readonly Thursday: 4;
    readonly Friday: 5;
    readonly Saturday: 6;
};
export type Weekday = (typeof Weekday)[keyof typeof Weekday];
export declare class InvalidDateError extends Error {
    constructor(value: string);
}
/** Parses and validates an ISO date, rejecting non-existent days (e.g. 2026-02-30). */
export declare function parseIsoDate(value: string): IsoDate;
export declare function toDate(value: IsoDate): Date;
export declare function fromDate(date: Date): IsoDate;
export declare function addDays(value: IsoDate, days: number): IsoDate;
export declare function addMonths(value: IsoDate, months: number): IsoDate;
export declare function daysInMonth(year: number, monthIndex: number): number;
export declare function weekdayOf(value: IsoDate): Weekday;
export declare function differenceInDays(from: IsoDate, to: IsoDate): number;
export declare function compareDates(a: IsoDate, b: IsoDate): number;
/** Next occurrence of `weekday` strictly after `value` (or on it when `inclusive`). */
export declare function nextWeekday(value: IsoDate, weekday: Weekday, inclusive?: boolean): IsoDate;
/** The `ordinal`-th `weekday` of a month, or `undefined` when the month has fewer. */
export declare function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: Weekday, ordinal: number): IsoDate | undefined;
/**
 * Which "weekend of the month" a Friday belongs to, counted by Fridays.
 *
 * Tex. Fam. Code § 153.3101 defines the standard possession weekends by
 * counting Fridays within the calendar month, so the 5th weekend exists only in
 * months containing five Fridays.
 */
export declare function fridayOrdinalInMonth(friday: IsoDate): number;
export declare function isLeapYear(year: number): boolean;
/** `true` when the year is even — the parity that drives alternating holidays. */
export declare function isEvenYear(value: IsoDate): boolean;
export declare function formatLong(value: IsoDate): string;
export declare function today(now?: Date): IsoDate;
