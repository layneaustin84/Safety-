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
export type IsoDate = string & { readonly __brand: "IsoDate" };

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
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export class InvalidDateError extends Error {
  public constructor(value: string) {
    super(`Invalid calendar date: ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
    this.name = "InvalidDateError";
  }
}

/** Parses and validates an ISO date, rejecting non-existent days (e.g. 2026-02-30). */
export function parseIsoDate(value: string): IsoDate {
  const match = ISO_DATE_RE.exec(value);
  if (match === null) throw new InvalidDateError(value);
  const [, y, m, d] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new InvalidDateError(value);
  }
  return value as IsoDate;
}

export function toDate(value: IsoDate): Date {
  const match = ISO_DATE_RE.exec(value);
  if (match === null) throw new InvalidDateError(value);
  const [, y, m, d] = match as unknown as [string, string, string, string];
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function fromDate(date: Date): IsoDate {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as IsoDate;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromDate(new Date(toDate(value).getTime() + days * DAY_MS));
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = toDate(value);
  const targetMonth = date.getUTCMonth() + months;
  const clamped = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  // Clamp the day so "Jan 31 + 1 month" lands on the last day of February.
  const lastDay = daysInMonth(clamped.getUTCFullYear(), clamped.getUTCMonth());
  clamped.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return fromDate(clamped);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function weekdayOf(value: IsoDate): Weekday {
  return toDate(value).getUTCDay() as Weekday;
}

export function differenceInDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

/** Next occurrence of `weekday` strictly after `value` (or on it when `inclusive`). */
export function nextWeekday(value: IsoDate, weekday: Weekday, inclusive = false): IsoDate {
  const current = weekdayOf(value);
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  return addDays(value, delta);
}

/** The `ordinal`-th `weekday` of a month, or `undefined` when the month has fewer. */
export function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: Weekday,
  ordinal: number,
): IsoDate | undefined {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  if (day > daysInMonth(year, monthIndex)) return undefined;
  return fromDate(new Date(Date.UTC(year, monthIndex, day)));
}

/**
 * Which "weekend of the month" a Friday belongs to, counted by Fridays.
 *
 * Tex. Fam. Code § 153.3101 defines the standard possession weekends by
 * counting Fridays within the calendar month, so the 5th weekend exists only in
 * months containing five Fridays.
 */
export function fridayOrdinalInMonth(friday: IsoDate): number {
  if (weekdayOf(friday) !== Weekday.Friday) {
    throw new Error(`${friday} is not a Friday; weekend ordinals count Fridays.`);
  }
  return Math.floor((toDate(friday).getUTCDate() - 1) / 7) + 1;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `true` when the year is even — the parity that drives alternating holidays. */
export function isEvenYear(value: IsoDate): boolean {
  return toDate(value).getUTCFullYear() % 2 === 0;
}

export function formatLong(value: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(toDate(value));
}

export function today(now: Date = new Date()): IsoDate {
  // Project the instant into the court's civil calendar before truncating.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseIsoDate(parts);
}
