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
import {
  Weekday,
  addDays,
  compareDates,
  fridayOrdinalInMonth,
  fromDate,
  nextWeekday,
  nthWeekdayOfMonth,
  parseIsoDate,
  toDate,
  weekdayOf,
} from "./dates.ts";

/** Which parent a possession period belongs to. */
export type Parent = "possessory" | "custodial";

/**
 * Precedence tiers. A period only ever yields to a strictly higher tier, which
 * is how the statute layers the schedule: holiday possession supersedes both
 * summer and the ordinary weekends, and extended summer possession supersedes
 * the ordinary weekend and Thursday periods (Tex. Fam. Code §§ 153.315-153.316).
 */
export const PRECEDENCE = {
  regular: 1,
  summer: 2,
  holiday: 3,
} as const;

export type Precedence = (typeof PRECEDENCE)[keyof typeof PRECEDENCE];

export interface PossessionPeriod {
  readonly label: string;
  readonly precedence: Precedence;
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
  readonly schoolYear?: { readonly firstDay: IsoDate; readonly lastDay: IsoDate };
}

/** A period removed or shortened because a higher-precedence period covers it. */
export interface SupersededPeriod {
  readonly period: PossessionPeriod;
  readonly supersededBy: string;
  readonly outcome: "removed" | "shortened";
}

export interface PossessionSchedule {
  readonly scheduleType: "standard" | "long-distance";
  /** Conflict-free. No two periods here overlap. */
  readonly periods: readonly PossessionPeriod[];
  /** What the precedence rules removed or trimmed, and why. */
  readonly superseded: readonly SupersededPeriod[];
  readonly statutoryBasis: readonly string[];
  readonly caveats: readonly string[];
}

/** Over this distance the § 153.313 alternate schedule applies. */
export const LONG_DISTANCE_THRESHOLD_MILES = 100;

const WEEKEND_ORDINALS = new Set([1, 3, 5]);

function* eachDay(from: IsoDate, to: IsoDate): Generator<IsoDate> {
  for (let cursor = from; compareDates(cursor, to) <= 0; cursor = addDays(cursor, 1)) {
    yield cursor;
  }
}

/** Default school-year window when the caller supplies no district calendar. */
function defaultSchoolYear(year: number): { firstDay: IsoDate; lastDay: IsoDate } {
  return {
    firstDay: parseIsoDate(`${year}-08-15`),
    lastDay: parseIsoDate(`${year + 1}-05-31`),
  };
}

function inSchoolYear(day: IsoDate, options: PossessionOptions): boolean {
  if (options.schoolYear !== undefined) {
    return (
      compareDates(day, options.schoolYear.firstDay) >= 0 &&
      compareDates(day, options.schoolYear.lastDay) <= 0
    );
  }
  const year = toDate(day).getUTCFullYear();
  const current = defaultSchoolYear(year);
  const previous = defaultSchoolYear(year - 1);
  const within = (w: { firstDay: IsoDate; lastDay: IsoDate }): boolean =>
    compareDates(day, w.firstDay) >= 0 && compareDates(day, w.lastDay) <= 0;
  return within(current) || within(previous);
}

function weekendPeriods(
  from: IsoDate,
  to: IsoDate,
  options: PossessionOptions,
): PossessionPeriod[] {
  const expanded = options.expandedElection === true;
  const periods: PossessionPeriod[] = [];
  for (const day of eachDay(from, to)) {
    if (weekdayOf(day) !== Weekday.Friday) continue;
    if (!WEEKEND_ORDINALS.has(fridayOrdinalInMonth(day))) continue;
    periods.push({
      label: `${ordinalLabel(fridayOrdinalInMonth(day))} weekend`,
      precedence: PRECEDENCE.regular,
      parent: "possessory",
      start: day,
      startTime: expanded ? "15:30" : "18:00",
      end: addDays(day, expanded ? 3 : 2),
      endTime: expanded ? "08:00" : "18:00",
      statutoryBasis: expanded
        ? "Tex. Fam. Code §§ 153.312(a)(1), 153.3171"
        : "Tex. Fam. Code § 153.312(a)(1)",
      schoolDependent: expanded,
      ...(expanded
        ? {
            note:
              "Expanded election: possession begins when school is dismissed Friday " +
              "and ends when school resumes Monday. Times shown are placeholders.",
          }
        : {}),
    });
  }
  return periods;
}

function thursdayPeriods(
  from: IsoDate,
  to: IsoDate,
  options: PossessionOptions,
): PossessionPeriod[] {
  const expanded = options.expandedElection === true;
  const periods: PossessionPeriod[] = [];
  for (const day of eachDay(from, to)) {
    if (weekdayOf(day) !== Weekday.Thursday) continue;
    if (!inSchoolYear(day, options)) continue;
    periods.push({
      label: "Thursday during the school term",
      precedence: PRECEDENCE.regular,
      parent: "possessory",
      start: day,
      startTime: expanded ? "15:30" : "18:00",
      end: expanded ? addDays(day, 1) : day,
      endTime: expanded ? "08:00" : "20:00",
      statutoryBasis: expanded
        ? "Tex. Fam. Code §§ 153.312(a)(2), 153.3171"
        : "Tex. Fam. Code § 153.312(a)(2)",
      schoolDependent: true,
      note: expanded
        ? "Expanded election: dismissal Thursday until school resumes Friday."
        : "Applies only while school is in session; confirm against the district calendar.",
    });
  }
  return periods;
}

function ordinalLabel(n: number): string {
  return n === 1 ? "1st" : n === 3 ? "3rd" : n === 5 ? "5th" : `${n}th`;
}

/**
 * Alternating holidays under § 153.314. The possessory conservator takes
 * Thanksgiving and the first half of Christmas in odd-numbered years, and
 * spring break plus the second half of Christmas in even-numbered years.
 */
function holidayPeriods(year: number, options: PossessionOptions): PossessionPeriod[] {
  const odd = year % 2 === 1;
  const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;
  const periods: PossessionPeriod[] = [];

  const thanksgiving = nthWeekdayOfMonth(year, 10, Weekday.Thursday, 4);
  if (thanksgiving !== undefined) {
    periods.push({
      label: "Thanksgiving",
      precedence: PRECEDENCE.holiday,
      parent: odd ? "possessory" : "custodial",
      start: addDays(thanksgiving, -1),
      startTime: "15:30",
      end: addDays(thanksgiving, 3),
      endTime: "18:00",
      statutoryBasis: "Tex. Fam. Code § 153.314(3)",
      schoolDependent: true,
      note: `Possessory conservator takes Thanksgiving in odd-numbered years; ${year} is ${
        odd ? "odd" : "even"
      }. Begins at school dismissal the Wednesday before.`,
    });
  }

  periods.push({
    label: "Christmas, first half",
    precedence: PRECEDENCE.holiday,
    parent: odd ? "possessory" : "custodial",
    start: parseIsoDate(`${year}-12-18`),
    startTime: "15:30",
    end: parseIsoDate(`${year}-12-28`),
    endTime: "12:00",
    statutoryBasis: "Tex. Fam. Code § 153.314(1)",
    schoolDependent: true,
    note:
      "Begins the day the child is dismissed for the winter break; the start date " +
      "shown is a placeholder pending the district calendar. Ends at noon on December 28.",
  });

  periods.push({
    label: "Christmas, second half",
    precedence: PRECEDENCE.holiday,
    parent: odd ? "custodial" : "possessory",
    start: parseIsoDate(`${year}-12-28`),
    startTime: "12:00",
    end: parseIsoDate(`${year + 1}-01-06`),
    endTime: "18:00",
    statutoryBasis: "Tex. Fam. Code § 153.314(2)",
    schoolDependent: true,
    note: "Ends at 6 p.m. the day before school resumes; the end date shown is a placeholder.",
  });

  periods.push({
    label: "Spring break",
    precedence: PRECEDENCE.holiday,
    parent: longDistance || year % 2 === 0 ? "possessory" : "custodial",
    start: parseIsoDate(`${year}-03-09`),
    startTime: "15:30",
    end: parseIsoDate(`${year}-03-16`),
    endTime: "18:00",
    statutoryBasis: longDistance
      ? "Tex. Fam. Code § 153.313(4)"
      : "Tex. Fam. Code § 153.314(4)",
    schoolDependent: true,
    note: longDistance
      ? "Beyond 100 miles the possessory conservator has every spring break."
      : "Possessory conservator takes spring break in even-numbered years. Dates are placeholders.",
  });

  const role = options.possessoryParentRole;
  if (role !== undefined) {
    const mothersDay = nthWeekdayOfMonth(year, 4, Weekday.Sunday, 2);
    const fathersDay = nthWeekdayOfMonth(year, 5, Weekday.Sunday, 3);
    if (mothersDay !== undefined) {
      periods.push({
        label: "Mother's Day weekend",
        precedence: PRECEDENCE.holiday,
        parent: role === "mother" ? "possessory" : "custodial",
        start: addDays(mothersDay, -2),
        startTime: "18:00",
        end: mothersDay,
        endTime: "18:00",
        statutoryBasis: "Tex. Fam. Code § 153.314(6)",
        schoolDependent: false,
      });
    }
    if (fathersDay !== undefined) {
      periods.push({
        label: "Father's Day weekend",
        precedence: PRECEDENCE.holiday,
        parent: role === "father" ? "possessory" : "custodial",
        start: addDays(fathersDay, -2),
        startTime: "18:00",
        end: fathersDay,
        endTime: "18:00",
        statutoryBasis: "Tex. Fam. Code § 153.314(5)",
        schoolDependent: false,
      });
    }
  }

  return periods;
}

function summerPeriod(year: number, options: PossessionOptions): PossessionPeriod {
  const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;
  return longDistance
    ? {
        label: "Extended summer possession (42 days)",
        precedence: PRECEDENCE.summer,
        parent: "possessory",
        start: parseIsoDate(`${year}-06-15`),
        startTime: "18:00",
        end: parseIsoDate(`${year}-07-27`),
        endTime: "18:00",
        statutoryBasis: "Tex. Fam. Code § 153.313(1)",
        schoolDependent: false,
        note:
          "Default period when no written election is made by April 1. With timely " +
          "notice the possessory conservator may instead designate 42 days in up to " +
          "two periods of at least seven days each.",
      }
    : {
        label: "Extended summer possession (30 days)",
        precedence: PRECEDENCE.summer,
        parent: "possessory",
        start: parseIsoDate(`${year}-07-01`),
        startTime: "18:00",
        end: parseIsoDate(`${year}-07-31`),
        endTime: "18:00",
        statutoryBasis: "Tex. Fam. Code § 153.312(b)(2)",
        schoolDependent: false,
        note:
          "Default period when no written election is made by April 1. With timely " +
          "notice the possessory conservator may instead designate 30 days in up to " +
          "two periods of at least seven days each.",
      };
}

/** Wall-clock instant as minutes from the epoch, for interval arithmetic. */
function instant(date: IsoDate, time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return Math.round(toDate(date).getTime() / 60_000) + hours * 60 + minutes;
}

function fromInstant(value: number): { date: IsoDate; time: string } {
  const dayStart = Math.floor(value / 1440) * 1440;
  const minutesIntoDay = value - dayStart;
  const date = fromDate(new Date(dayStart * 60_000));
  const hours = String(Math.floor(minutesIntoDay / 60)).padStart(2, "0");
  const minutes = String(minutesIntoDay % 60).padStart(2, "0");
  return { date, time: `${hours}:${minutes}` };
}

function startOf(period: PossessionPeriod): number {
  return instant(period.start, period.startTime);
}

function endOf(period: PossessionPeriod): number {
  return instant(period.end, period.endTime);
}

/**
 * Applies the statutory precedence rules so the calendar never shows two
 * conflicting periods for the same hours.
 *
 * Holiday and extended summer possession are exceptions to the ordinary
 * schedule, not parallel schedules running beside it. A weekend that falls
 * inside a summer period is not a second possession period; it simply does not
 * happen, because the possessory conservator already has the child. Emitting
 * both was the bug this replaces.
 */
function resolvePrecedence(periods: readonly PossessionPeriod[]): {
  kept: PossessionPeriod[];
  superseded: SupersededPeriod[];
} {
  const byPrecedence = [...periods].sort(
    (a, b) => b.precedence - a.precedence || startOf(a) - startOf(b),
  );

  const kept: PossessionPeriod[] = [];
  const superseded: SupersededPeriod[] = [];

  for (const candidate of byPrecedence) {
    const overriders = kept.filter(
      (existing) =>
        existing.precedence > candidate.precedence &&
        startOf(existing) < endOf(candidate) &&
        endOf(existing) > startOf(candidate),
    );

    if (overriders.length === 0) {
      kept.push(candidate);
      continue;
    }

    let start = startOf(candidate);
    let end = endOf(candidate);
    for (const overrider of overriders) {
      const overriderStart = startOf(overrider);
      const overriderEnd = endOf(overrider);
      if (overriderStart <= start && overriderEnd >= end) {
        start = end; // Fully covered.
        break;
      }
      if (overriderStart <= start) start = Math.max(start, overriderEnd);
      else end = Math.min(end, overriderStart);
    }

    const reason = overriders.map((o) => o.label).join(", ");
    if (start >= end) {
      superseded.push({ period: candidate, supersededBy: reason, outcome: "removed" });
      continue;
    }

    const from = fromInstant(start);
    const to = fromInstant(end);
    const shortened: PossessionPeriod = {
      ...candidate,
      start: from.date,
      startTime: from.time,
      end: to.date,
      endTime: to.time,
      note: `${candidate.note === undefined ? "" : `${candidate.note} `}Shortened by ${reason}.`,
    };
    kept.push(shortened);
    superseded.push({ period: candidate, supersededBy: reason, outcome: "shortened" });
  }

  kept.sort((a, b) => startOf(a) - startOf(b));
  return { kept, superseded };
}

/** Builds the possession calendar for a date range. */
export function generatePossessionSchedule(
  from: IsoDate,
  to: IsoDate,
  options: PossessionOptions,
): PossessionSchedule {
  if (compareDates(from, to) > 0) {
    throw new Error("`from` must not be after `to`.");
  }
  const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;

  const periods: PossessionPeriod[] = [];

  if (longDistance) {
    // § 153.313(1): the possessory conservator elects either the 1st/3rd/5th
    // weekends or one weekend per month. The default shown is one per month.
    for (let year = toDate(from).getUTCFullYear(); year <= toDate(to).getUTCFullYear(); year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const friday = nthWeekdayOfMonth(year, month, Weekday.Friday, 1);
        if (friday === undefined) continue;
        if (compareDates(friday, from) < 0 || compareDates(friday, to) > 0) continue;
        periods.push({
          label: "Monthly weekend (long-distance election)",
          precedence: PRECEDENCE.regular,
          parent: "possessory",
          start: friday,
          startTime: "18:00",
          end: addDays(friday, 2),
          endTime: "18:00",
          statutoryBasis: "Tex. Fam. Code § 153.313(2)",
          schoolDependent: false,
          note:
            "Requires at least 14 days' written notice designating the weekend; " +
            "the first weekend of each month is shown as a default.",
        });
      }
    }
  } else {
    periods.push(...weekendPeriods(from, to, options));
    periods.push(...thursdayPeriods(from, to, options));
  }

  for (let year = toDate(from).getUTCFullYear(); year <= toDate(to).getUTCFullYear(); year += 1) {
    periods.push(...holidayPeriods(year, options));
    periods.push(summerPeriod(year, options));
  }

  const inRange = periods.filter(
    (p) => compareDates(p.end, from) >= 0 && compareDates(p.start, to) <= 0,
  );
  const { kept, superseded } = resolvePrecedence(inRange);

  return {
    scheduleType: longDistance ? "long-distance" : "standard",
    periods: kept,
    superseded,
    statutoryBasis: longDistance
      ? ["Tex. Fam. Code § 153.313", "Tex. Fam. Code § 153.314", "Tex. Fam. Code § 153.315"]
      : [
          "Tex. Fam. Code § 153.312",
          "Tex. Fam. Code § 153.314",
          "Tex. Fam. Code § 153.315",
          "Tex. Fam. Code § 153.3171",
        ],
    caveats: [
      "Holiday possession supersedes both summer and the ordinary weekend and " +
        "Thursday periods; extended summer possession supersedes the ordinary " +
        "weekends and Thursdays it covers (§§ 153.315-153.316). Periods removed " +
        "or shortened by that rule are listed separately rather than dropped silently.",
      "During the possessory conservator's extended summer possession, the managing " +
        "conservator may designate one weekend of their own with timely written " +
        "notice (§ 153.312(b)(3)). That election is not generated here because it " +
        "depends on a notice this package cannot see.",
      "Dates tied to school dismissal or resumption are placeholders. Confirm " +
        "them against the child's district calendar (Spring ISD, Klein ISD, or " +
        "Conroe ISD in the Spring area).",
      "This generator reflects the statutory default. A signed order controls " +
        "wherever it differs from the standard order.",
      "Children under three are not covered by the standard order; § 153.254 " +
        "governs instead.",
    ],
  };
}

/** Convenience: the next `count` possession periods on or after `from`. */
export function nextPossessionPeriods(
  from: IsoDate,
  count: number,
  options: PossessionOptions,
): readonly PossessionPeriod[] {
  const horizon = addDays(from, 400);
  return generatePossessionSchedule(from, horizon, options).periods.slice(0, count);
}

/** Exported for tests: the first Monday after a given date. */
export const mondayAfter = (value: IsoDate): IsoDate => nextWeekday(value, Weekday.Monday);
