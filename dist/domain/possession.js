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
import { Weekday, addDays, compareDates, fridayOrdinalInMonth, nextWeekday, nthWeekdayOfMonth, parseIsoDate, toDate, weekdayOf, } from "./dates.js";
/** Over this distance the § 153.313 alternate schedule applies. */
export const LONG_DISTANCE_THRESHOLD_MILES = 100;
const WEEKEND_ORDINALS = new Set([1, 3, 5]);
function* eachDay(from, to) {
    for (let cursor = from; compareDates(cursor, to) <= 0; cursor = addDays(cursor, 1)) {
        yield cursor;
    }
}
/** Default school-year window when the caller supplies no district calendar. */
function defaultSchoolYear(year) {
    return {
        firstDay: parseIsoDate(`${year}-08-15`),
        lastDay: parseIsoDate(`${year + 1}-05-31`),
    };
}
function inSchoolYear(day, options) {
    if (options.schoolYear !== undefined) {
        return (compareDates(day, options.schoolYear.firstDay) >= 0 &&
            compareDates(day, options.schoolYear.lastDay) <= 0);
    }
    const year = toDate(day).getUTCFullYear();
    const current = defaultSchoolYear(year);
    const previous = defaultSchoolYear(year - 1);
    const within = (w) => compareDates(day, w.firstDay) >= 0 && compareDates(day, w.lastDay) <= 0;
    return within(current) || within(previous);
}
function weekendPeriods(from, to, options) {
    const expanded = options.expandedElection === true;
    const periods = [];
    for (const day of eachDay(from, to)) {
        if (weekdayOf(day) !== Weekday.Friday)
            continue;
        if (!WEEKEND_ORDINALS.has(fridayOrdinalInMonth(day)))
            continue;
        periods.push({
            label: `${ordinalLabel(fridayOrdinalInMonth(day))} weekend`,
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
                    note: "Expanded election: possession begins when school is dismissed Friday " +
                        "and ends when school resumes Monday. Times shown are placeholders.",
                }
                : {}),
        });
    }
    return periods;
}
function thursdayPeriods(from, to, options) {
    const expanded = options.expandedElection === true;
    const periods = [];
    for (const day of eachDay(from, to)) {
        if (weekdayOf(day) !== Weekday.Thursday)
            continue;
        if (!inSchoolYear(day, options))
            continue;
        periods.push({
            label: "Thursday during the school term",
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
function ordinalLabel(n) {
    return n === 1 ? "1st" : n === 3 ? "3rd" : n === 5 ? "5th" : `${n}th`;
}
/**
 * Alternating holidays under § 153.314. The possessory conservator takes
 * Thanksgiving and the first half of Christmas in odd-numbered years, and
 * spring break plus the second half of Christmas in even-numbered years.
 */
function holidayPeriods(year, options) {
    const odd = year % 2 === 1;
    const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;
    const periods = [];
    const thanksgiving = nthWeekdayOfMonth(year, 10, Weekday.Thursday, 4);
    if (thanksgiving !== undefined) {
        periods.push({
            label: "Thanksgiving",
            parent: odd ? "possessory" : "custodial",
            start: addDays(thanksgiving, -1),
            startTime: "15:30",
            end: addDays(thanksgiving, 3),
            endTime: "18:00",
            statutoryBasis: "Tex. Fam. Code § 153.314(3)",
            schoolDependent: true,
            note: `Possessory conservator takes Thanksgiving in odd-numbered years; ${year} is ${odd ? "odd" : "even"}. Begins at school dismissal the Wednesday before.`,
        });
    }
    periods.push({
        label: "Christmas, first half",
        parent: odd ? "possessory" : "custodial",
        start: parseIsoDate(`${year}-12-18`),
        startTime: "15:30",
        end: parseIsoDate(`${year}-12-28`),
        endTime: "12:00",
        statutoryBasis: "Tex. Fam. Code § 153.314(1)",
        schoolDependent: true,
        note: "Begins the day the child is dismissed for the winter break; the start date " +
            "shown is a placeholder pending the district calendar. Ends at noon on December 28.",
    });
    periods.push({
        label: "Christmas, second half",
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
function summerPeriod(year, options) {
    const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;
    return longDistance
        ? {
            label: "Extended summer possession (42 days)",
            parent: "possessory",
            start: parseIsoDate(`${year}-06-15`),
            startTime: "18:00",
            end: parseIsoDate(`${year}-07-27`),
            endTime: "18:00",
            statutoryBasis: "Tex. Fam. Code § 153.313(1)",
            schoolDependent: false,
            note: "Default period when no written election is made by April 1. With timely " +
                "notice the possessory conservator may instead designate 42 days in up to " +
                "two periods of at least seven days each.",
        }
        : {
            label: "Extended summer possession (30 days)",
            parent: "possessory",
            start: parseIsoDate(`${year}-07-01`),
            startTime: "18:00",
            end: parseIsoDate(`${year}-07-31`),
            endTime: "18:00",
            statutoryBasis: "Tex. Fam. Code § 153.312(b)(2)",
            schoolDependent: false,
            note: "Default period when no written election is made by April 1. With timely " +
                "notice the possessory conservator may instead designate 30 days in up to " +
                "two periods of at least seven days each.",
        };
}
/** Builds the possession calendar for a date range. */
export function generatePossessionSchedule(from, to, options) {
    if (compareDates(from, to) > 0) {
        throw new Error("`from` must not be after `to`.");
    }
    const longDistance = options.distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;
    const periods = [];
    if (longDistance) {
        // § 153.313(1): the possessory conservator elects either the 1st/3rd/5th
        // weekends or one weekend per month. The default shown is one per month.
        for (let year = toDate(from).getUTCFullYear(); year <= toDate(to).getUTCFullYear(); year += 1) {
            for (let month = 0; month < 12; month += 1) {
                const friday = nthWeekdayOfMonth(year, month, Weekday.Friday, 1);
                if (friday === undefined)
                    continue;
                if (compareDates(friday, from) < 0 || compareDates(friday, to) > 0)
                    continue;
                periods.push({
                    label: "Monthly weekend (long-distance election)",
                    parent: "possessory",
                    start: friday,
                    startTime: "18:00",
                    end: addDays(friday, 2),
                    endTime: "18:00",
                    statutoryBasis: "Tex. Fam. Code § 153.313(2)",
                    schoolDependent: false,
                    note: "Requires at least 14 days' written notice designating the weekend; " +
                        "the first weekend of each month is shown as a default.",
                });
            }
        }
    }
    else {
        periods.push(...weekendPeriods(from, to, options));
        periods.push(...thursdayPeriods(from, to, options));
    }
    for (let year = toDate(from).getUTCFullYear(); year <= toDate(to).getUTCFullYear(); year += 1) {
        periods.push(...holidayPeriods(year, options));
        periods.push(summerPeriod(year, options));
    }
    const inRange = periods
        .filter((p) => compareDates(p.end, from) >= 0 && compareDates(p.start, to) <= 0)
        .sort((a, b) => compareDates(a.start, b.start));
    return {
        scheduleType: longDistance ? "long-distance" : "standard",
        periods: inRange,
        statutoryBasis: longDistance
            ? ["Tex. Fam. Code § 153.313", "Tex. Fam. Code § 153.314"]
            : ["Tex. Fam. Code § 153.312", "Tex. Fam. Code § 153.314", "Tex. Fam. Code § 153.3171"],
        caveats: [
            "Holiday possession overrides the regular weekend and Thursday periods " +
                "when they conflict (§ 153.315).",
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
export function nextPossessionPeriods(from, count, options) {
    const horizon = addDays(from, 400);
    return generatePossessionSchedule(from, horizon, options).periods.slice(0, count);
}
/** Exported for tests: the first Monday after a given date. */
export const mondayAfter = (value) => nextWeekday(value, Weekday.Monday);
//# sourceMappingURL=possession.js.map