/**
 * Deadline computation for Texas family cases.
 *
 * Periods are counted under Tex. R. Civ. P. 4: the day of the triggering event
 * is excluded, the last day is included, and a period ending on a Saturday,
 * Sunday, or legal holiday runs to the next day that is none of those.
 */
import { Weekday, addDays, addMonths, formatLong, nextWeekday, nthWeekdayOfMonth, parseIsoDate, toDate, weekdayOf, } from "./dates.js";
/** Texas state holidays that close the courts, for the Rule 4 roll-forward. */
export function texasLegalHolidays(year) {
    const fixed = [
        `${year}-01-01`,
        `${year}-06-19`,
        `${year}-07-04`,
        `${year}-11-11`,
        `${year}-12-24`,
        `${year}-12-25`,
        `${year}-12-26`,
    ].map(parseIsoDate);
    const floating = [];
    const push = (value) => {
        if (value !== undefined)
            floating.push(value);
    };
    push(nthWeekdayOfMonth(year, 0, Weekday.Monday, 3)); // Martin Luther King Jr. Day
    push(nthWeekdayOfMonth(year, 1, Weekday.Monday, 3)); // Presidents Day
    push(nthWeekdayOfMonth(year, 8, Weekday.Monday, 1)); // Labor Day
    // Memorial Day: the last Monday in May.
    for (let ordinal = 5; ordinal >= 4; ordinal -= 1) {
        const candidate = nthWeekdayOfMonth(year, 4, Weekday.Monday, ordinal);
        if (candidate !== undefined) {
            floating.push(candidate);
            break;
        }
    }
    const thanksgiving = nthWeekdayOfMonth(year, 10, Weekday.Thursday, 4);
    if (thanksgiving !== undefined) {
        floating.push(thanksgiving, addDays(thanksgiving, 1));
    }
    return [...fixed, ...floating];
}
function isCourtClosed(value) {
    const day = weekdayOf(value);
    if (day === Weekday.Saturday || day === Weekday.Sunday)
        return true;
    const year = toDate(value).getUTCFullYear();
    return texasLegalHolidays(year).includes(value);
}
/** Rolls a date forward to the next day the courts are open (Tex. R. Civ. P. 4). */
export function rollForward(value) {
    let cursor = value;
    let rolled = false;
    // Bounded: at most a week of consecutive closures is possible.
    for (let guard = 0; guard < 14 && isCourtClosed(cursor); guard += 1) {
        cursor = addDays(cursor, 1);
        rolled = true;
    }
    return { date: cursor, rolled };
}
function make(name, raw, authority, description, time) {
    const { date, rolled } = rollForward(raw);
    return {
        name,
        date,
        authority,
        description,
        rolledForHoliday: rolled,
        ...(time === undefined ? {} : { time }),
    };
}
/**
 * The Rule 99(b) answer date: 10:00 a.m. on the Monday next following the
 * expiration of twenty days after service. The Monday is *strictly* after the
 * twentieth day, so service that puts day 20 on a Monday answers the week after.
 */
export function answerDate(serviceDate) {
    const twentiethDay = addDays(serviceDate, 20);
    return nextWeekday(twentiethDay, Weekday.Monday);
}
export function computeDeadlines(input) {
    const { event, eventDate } = input;
    const deadlines = [];
    const caveats = [
        "Deadlines are computed from the date given. Verify the operative date " +
            "against the file-stamped document or the return of service.",
        "Local rules and a court's own scheduling order can shorten these periods.",
    ];
    switch (event) {
        case "petition_filed": {
            deadlines.push(make("Earliest date a divorce may be granted", addDays(eventDate, 60), "Tex. Fam. Code § 6.702", "A court may not grant a divorce before the 60th day after the petition is filed. " +
                "Section 6.702(c) waives the wait where there is a family-violence finding or " +
                "an active protective order against the other spouse."), make("Case dismissal review (housekeeping)", addMonths(eventDate, 6), "Tex. R. Jud. Admin. 6.1", "Uncontested family cases are expected to reach disposition within six months " +
                "of appearance; contested cases within twelve. Courts set dismissal dockets " +
                "against these benchmarks."));
            caveats.push("Harris and Montgomery County district courts both issue a standing order " +
                "on filing that restrains both parties as to the children, property, and " +
                "insurance. It binds the petitioner immediately and the respondent on service.");
            break;
        }
        case "served_with_citation": {
            const answer = answerDate(eventDate);
            deadlines.push({
                name: "Answer due",
                date: answer,
                time: "10:00",
                authority: "Tex. R. Civ. P. 99(b)",
                description: "The answer is due at 10:00 a.m. on the Monday next following the expiration " +
                    "of twenty days after service. Filing any answer, even a general denial, " +
                    "prevents a default judgment.",
                rolledForHoliday: false,
            });
            deadlines.push(make("Required initial disclosures due", addDays(answer, 30), "Tex. R. Civ. P. 194.2, 194.3", "Initial disclosures are due within 30 days after the first answer is filed, " +
                "without any discovery request."));
            break;
        }
        case "answer_filed": {
            deadlines.push(make("Required initial disclosures due", addDays(eventDate, 30), "Tex. R. Civ. P. 194.2, 194.3", "Both parties must serve initial disclosures within 30 days after the first " +
                "answer is filed. No request is needed."));
            break;
        }
        case "final_decree_signed": {
            deadlines.push(make("Motion for new trial or to modify the judgment due", addDays(eventDate, 30), "Tex. R. Civ. P. 329b(a)", "A motion for new trial must be filed within 30 days after the judgment is signed."), make("Notice of appeal due (no post-judgment motion)", addDays(eventDate, 30), "Tex. R. App. P. 26.1", "Extends to 90 days after the judgment is signed if a timely motion for new " +
                "trial, motion to modify, motion to reinstate, or request for findings is filed."), make("Request for findings of fact and conclusions of law due", addDays(eventDate, 20), "Tex. R. Civ. P. 296", "Available after a bench trial; the request preserves the record for appeal."), make("Trial court's plenary power expires", addDays(eventDate, 30), "Tex. R. Civ. P. 329b(d)", "Extended to 105 days if a timely post-judgment motion is filed and overruled " +
                "by operation of law."), make("Earliest remarriage to a third party", addDays(eventDate, 30), "Tex. Fam. Code § 6.801", "Neither party may marry a third party for 30 days after the divorce is granted, " +
                "absent a waiver from the court."));
            break;
        }
        case "temporary_restraining_order_signed": {
            deadlines.push(make("Temporary restraining order expires", addDays(eventDate, 14), "Tex. R. Civ. P. 680", "A TRO lasts no more than 14 days and may be extended once for a like period " +
                "for good cause or by consent."), make("Temporary orders hearing must be set by", addDays(eventDate, 14), "Tex. R. Civ. P. 680; Tex. Fam. Code § 6.501", "The hearing on temporary orders is set within the life of the restraining order."));
            break;
        }
        case "ex_parte_protective_order_signed": {
            deadlines.push(make("Temporary ex parte protective order expires", addDays(eventDate, 20), "Tex. Fam. Code § 83.002", "Valid for up to 20 days, extendable for additional 20-day periods on request."), make("Hearing on the application for a protective order", addDays(eventDate, 14), "Tex. Fam. Code § 84.001", "The court sets a hearing not later than the 14th day after the application " +
                "is filed, or the 20th day in the largest counties and where a request to " +
                "transfer is pending."));
            caveats.push("Protective order timelines move quickly and a missed hearing can dissolve " +
                "the order. Confirm the setting with the court coordinator.");
            break;
        }
        case "trial_setting": {
            deadlines.push(make("Jury demand and fee due", addDays(eventDate, -30), "Tex. R. Civ. P. 216", "A jury must be demanded, and the fee paid, a reasonable time before trial and " +
                "in no event less than 30 days in advance. In a SAPCR the jury decides " +
                "conservatorship and primary residence, not possession specifics or support " +
                "(Tex. Fam. Code § 105.002)."), make("Discovery period ends", addDays(eventDate, -30), "Tex. R. Civ. P. 190.3(b)(1)", "Under a Level 2 plan the discovery period closes 30 days before trial. " +
                "Family cases with children instead run nine months from the first " +
                "deposition or initial disclosure response, whichever is earlier."), make("Expert designation (party with the burden of proof)", addDays(eventDate, -90), "Tex. R. Civ. P. 195.2(a)", "Ninety days before the end of the discovery period for the party seeking " +
                "affirmative relief; 60 days for other parties."));
            caveats.push("Backward-counted deadlines are shown rolled forward to an open court day, " +
                "which can make them later than the rule allows. Treat the earlier date " +
                "as controlling and file before it.");
            break;
        }
    }
    return { event, eventDate, deadlines, caveats };
}
/** Human-readable one-line rendering, for the CLI and tool output. */
export function formatDeadline(deadline) {
    const time = deadline.time === undefined ? "" : ` at ${deadline.time}`;
    const rolled = deadline.rolledForHoliday ? " (rolled forward to an open court day)" : "";
    return `${deadline.name}: ${formatLong(deadline.date)}${time}${rolled} — ${deadline.authority}`;
}
//# sourceMappingURL=deadlines.js.map