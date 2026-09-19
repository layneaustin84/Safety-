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
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;
/**
 * Days of the week, indexed to match `Date.prototype.getUTCDay()`.
 *
 * A frozen object rather than a TypeScript `enum`, so the source stays
 * erasable and runs under Node's type-stripping without a build step.
 */
export const Weekday = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};
export class InvalidDateError extends Error {
    constructor(value) {
        super(`Invalid calendar date: ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
        this.name = "InvalidDateError";
    }
}
/** Parses and validates an ISO date, rejecting non-existent days (e.g. 2026-02-30). */
export function parseIsoDate(value) {
    const match = ISO_DATE_RE.exec(value);
    if (match === null)
        throw new InvalidDateError(value);
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCFullYear() !== Number(y) ||
        date.getUTCMonth() !== Number(m) - 1 ||
        date.getUTCDate() !== Number(d)) {
        throw new InvalidDateError(value);
    }
    return value;
}
export function toDate(value) {
    const match = ISO_DATE_RE.exec(value);
    if (match === null)
        throw new InvalidDateError(value);
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}
export function fromDate(date) {
    const y = String(date.getUTCFullYear()).padStart(4, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
export function addDays(value, days) {
    return fromDate(new Date(toDate(value).getTime() + days * DAY_MS));
}
export function addMonths(value, months) {
    const date = toDate(value);
    const targetMonth = date.getUTCMonth() + months;
    const clamped = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
    // Clamp the day so "Jan 31 + 1 month" lands on the last day of February.
    const lastDay = daysInMonth(clamped.getUTCFullYear(), clamped.getUTCMonth());
    clamped.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return fromDate(clamped);
}
export function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
export function weekdayOf(value) {
    return toDate(value).getUTCDay();
}
export function differenceInDays(from, to) {
    return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}
export function compareDates(a, b) {
    return toDate(a).getTime() - toDate(b).getTime();
}
/** Next occurrence of `weekday` strictly after `value` (or on it when `inclusive`). */
export function nextWeekday(value, weekday, inclusive = false) {
    const current = weekdayOf(value);
    let delta = (weekday - current + 7) % 7;
    if (delta === 0 && !inclusive)
        delta = 7;
    return addDays(value, delta);
}
/** The `ordinal`-th `weekday` of a month, or `undefined` when the month has fewer. */
export function nthWeekdayOfMonth(year, monthIndex, weekday, ordinal) {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (ordinal - 1) * 7;
    if (day > daysInMonth(year, monthIndex))
        return undefined;
    return fromDate(new Date(Date.UTC(year, monthIndex, day)));
}
/**
 * Which "weekend of the month" a Friday belongs to, counted by Fridays.
 *
 * Tex. Fam. Code § 153.3101 defines the standard possession weekends by
 * counting Fridays within the calendar month, so the 5th weekend exists only in
 * months containing five Fridays.
 */
export function fridayOrdinalInMonth(friday) {
    if (weekdayOf(friday) !== Weekday.Friday) {
        throw new Error(`${friday} is not a Friday; weekend ordinals count Fridays.`);
    }
    return Math.floor((toDate(friday).getUTCDate() - 1) / 7) + 1;
}
export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
/** `true` when the year is even — the parity that drives alternating holidays. */
export function isEvenYear(value) {
    return toDate(value).getUTCFullYear() % 2 === 0;
}
export function formatLong(value) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(toDate(value));
}
export function today(now = new Date()) {
    // Project the instant into the court's civil calendar before truncating.
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
    return parseIsoDate(parts);
}
//# sourceMappingURL=dates.js.map