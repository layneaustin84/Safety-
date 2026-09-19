import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  Weekday,
  addDays,
  addMonths,
  compareDates,
  fridayOrdinalInMonth,
  nextWeekday,
  nthWeekdayOfMonth,
  parseIsoDate,
  weekdayOf,
  type IsoDate,
} from "../src/domain/dates.ts";
import {
  calculateGuidelineChildSupport,
  capFor,
  ChildSupportInputError,
} from "../src/domain/childSupport.ts";
import { answerDate, computeDeadlines, rollForward } from "../src/domain/deadlines.ts";
import { generatePossessionSchedule } from "../src/domain/possession.ts";
import { venueForZip } from "../src/data/courts.ts";
import { searchStatutes } from "../src/data/statutes.ts";
import { screenForRisk } from "../src/guardrails.ts";
import { CaseFileStore } from "../src/caseFile.ts";

const d = (value: string): IsoDate => parseIsoDate(value);

describe("dates", () => {
  it("rejects impossible calendar days", () => {
    assert.throws(() => parseIsoDate("2026-02-30"));
    assert.throws(() => parseIsoDate("2026-13-01"));
    assert.throws(() => parseIsoDate("not-a-date"));
  });

  it("clamps month arithmetic to the end of a short month", () => {
    assert.equal(addMonths(d("2026-01-31"), 1), "2026-02-28");
    assert.equal(addMonths(d("2024-01-31"), 1), "2024-02-29");
  });

  it("crosses a DST boundary without losing a day", () => {
    // US DST begins 2026-03-08; naive local-time arithmetic drops an hour here.
    assert.equal(addDays(d("2026-03-07"), 1), "2026-03-08");
    assert.equal(addDays(d("2026-03-08"), 1), "2026-03-09");
  });

  it("finds the next weekday, exclusive by default", () => {
    assert.equal(weekdayOf(d("2026-09-21")), Weekday.Monday);
    assert.equal(nextWeekday(d("2026-09-21"), Weekday.Monday), "2026-09-28");
    assert.equal(nextWeekday(d("2026-09-21"), Weekday.Monday, true), "2026-09-21");
  });

  it("returns undefined for a fifth weekday a month does not have", () => {
    assert.equal(nthWeekdayOfMonth(2026, 1, Weekday.Monday, 5), undefined);
    assert.equal(nthWeekdayOfMonth(2026, 0, Weekday.Thursday, 1), "2026-01-01");
  });

  it("counts weekend ordinals by Fridays", () => {
    assert.equal(fridayOrdinalInMonth(d("2026-01-02")), 1);
    assert.equal(fridayOrdinalInMonth(d("2026-01-16")), 3);
    assert.equal(fridayOrdinalInMonth(d("2026-01-30")), 5);
    assert.throws(() => fridayOrdinalInMonth(d("2026-01-01")));
  });
});

describe("guideline child support", () => {
  const asOf = d("2026-01-15");

  it("applies the standard percentages", () => {
    const one = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 5000,
      childrenBeforeCourt: 1,
      asOf,
    });
    assert.equal(one.monthlyGuidelineSupportUsd, 1000);
    assert.equal(one.appliedPercentage, 20);
    assert.equal(one.scheduleUsed, "standard");

    const three = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 5000,
      childrenBeforeCourt: 3,
      asOf,
    });
    assert.equal(three.monthlyGuidelineSupportUsd, 1500);
  });

  it("caps net resources before applying the percentage", () => {
    const cap = capFor(asOf);
    const result = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 25_000,
      childrenBeforeCourt: 2,
      asOf,
    });
    assert.equal(result.capApplied, true);
    assert.equal(result.cappedNetResourcesUsd, cap.monthlyCapUsd);
    assert.equal(result.monthlyGuidelineSupportUsd, cap.monthlyCapUsd * 0.25);
  });

  it("uses the reduced schedule below the low-income floor", () => {
    const result = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 900,
      childrenBeforeCourt: 2,
      asOf,
    });
    assert.equal(result.scheduleUsed, "low-income");
    assert.equal(result.appliedPercentage, 20);
    assert.equal(result.monthlyGuidelineSupportUsd, 180);
  });

  it("switches to the multiple-household table", () => {
    const result = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 4000,
      childrenBeforeCourt: 2,
      otherChildrenSupported: 1,
      asOf,
    });
    assert.equal(result.scheduleUsed, "multiple-household");
    assert.equal(result.appliedPercentage, 22.5);
    assert.equal(result.monthlyGuidelineSupportUsd, 900);
  });

  it("downgrades readiness when the cap is unverified, not merely warns", () => {
    const result = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 20_000,
      childrenBeforeCourt: 1,
      asOf: d("2026-06-01"),
    });
    assert.equal(result.cap.provenance.verificationStatus, "unverified");
    assert.equal(result.readiness, "requires_verification");
    assert.equal(result.provenance[0]?.sourceUrl.includes("texasattorneygeneral.gov"), true);
    assert.ok(result.caveats.some((c) => c.includes("texasattorneygeneral.gov")));
  });

  it("reports ready when the applicable cap is verified", () => {
    const result = calculateGuidelineChildSupport({
      monthlyNetResourcesUsd: 5000,
      childrenBeforeCourt: 1,
      asOf: d("2021-06-01"),
    });
    assert.equal(result.cap.provenance.verificationStatus, "verified");
    assert.equal(result.readiness, "ready");
  });

  it("rejects malformed input", () => {
    assert.throws(
      () =>
        calculateGuidelineChildSupport({
          monthlyNetResourcesUsd: -1,
          childrenBeforeCourt: 1,
          asOf,
        }),
      ChildSupportInputError,
    );
    assert.throws(
      () =>
        calculateGuidelineChildSupport({
          monthlyNetResourcesUsd: 100,
          childrenBeforeCourt: 0,
          asOf,
        }),
      ChildSupportInputError,
    );
  });
});

describe("deadlines", () => {
  it("computes the Rule 99(b) answer date", () => {
    // Served Monday 2026-09-21; day 20 is 2026-10-11 (Sunday); answer 2026-10-12.
    assert.equal(answerDate(d("2026-09-21")), "2026-10-12");
  });

  it("pushes to the following week when day 20 is itself a Monday", () => {
    // Rule 99(b) counts the Monday *next following* the 20th day, so a 20th day
    // that already falls on a Monday does not answer that same morning.
    const twentieth = addDays(d("2026-09-22"), 20);
    assert.equal(twentieth, "2026-10-12");
    assert.equal(weekdayOf(twentieth), Weekday.Monday);
    assert.equal(answerDate(d("2026-09-22")), "2026-10-19");
  });

  it("rolls a deadline off a weekend", () => {
    const saturday = d("2026-09-19");
    assert.equal(weekdayOf(saturday), Weekday.Saturday);
    const rolled = rollForward(saturday);
    assert.equal(rolled.date, "2026-09-21");
    assert.equal(rolled.rolled, true);
  });

  it("rolls a deadline off a Texas court holiday", () => {
    const rolled = rollForward(d("2026-07-04"));
    assert.equal(rolled.rolled, true);
    assert.notEqual(rolled.date, "2026-07-04");
  });

  it("gives the 60-day divorce waiting period from filing", () => {
    const result = computeDeadlines({ event: "petition_filed", eventDate: d("2026-01-05") });
    const wait = result.deadlines.find((x) => x.name.startsWith("Earliest date"));
    assert.ok(wait !== undefined);
    assert.equal(wait.authority, "Tex. Fam. Code § 6.702");
    assert.equal(wait.date, "2026-03-06");
  });

  it("expires a TRO after fourteen days", () => {
    const result = computeDeadlines({
      event: "temporary_restraining_order_signed",
      eventDate: d("2026-02-02"),
    });
    const tro = result.deadlines.find((x) => x.name.includes("expires"));
    assert.ok(tro !== undefined);
    // Day 14 is Presidents Day 2026, so Rule 4 carries it to the next open day.
    assert.equal(tro.date, "2026-02-17");
    assert.equal(tro.rolledForHoliday, true);
  });
});

describe("possession schedule", () => {
  it("emits 1st, 3rd, and 5th weekends within 100 miles", () => {
    const schedule = generatePossessionSchedule(d("2026-01-01"), d("2026-01-31"), {
      distanceMiles: 20,
    });
    const weekends = schedule.periods.filter((p) => p.label.endsWith("weekend"));
    assert.deepEqual(
      weekends.map((w) => w.start),
      ["2026-01-02", "2026-01-16", "2026-01-30"],
    );
    assert.equal(schedule.scheduleType, "standard");
  });

  it("switches to the long-distance schedule past 100 miles", () => {
    const schedule = generatePossessionSchedule(d("2026-01-01"), d("2026-03-31"), {
      distanceMiles: 240,
    });
    assert.equal(schedule.scheduleType, "long-distance");
    assert.ok(schedule.periods.every((p) => !p.label.startsWith("Thursday")));
    const summer = generatePossessionSchedule(d("2026-06-01"), d("2026-08-31"), {
      distanceMiles: 240,
    }).periods.find((p) => p.label.includes("42 days"));
    assert.ok(summer !== undefined);
  });

  it("alternates Thanksgiving by year parity", () => {
    const odd = generatePossessionSchedule(d("2025-11-01"), d("2025-11-30"), {
      distanceMiles: 10,
    }).periods.find((p) => p.label === "Thanksgiving");
    const even = generatePossessionSchedule(d("2026-11-01"), d("2026-11-30"), {
      distanceMiles: 10,
    }).periods.find((p) => p.label === "Thanksgiving");
    assert.equal(odd?.parent, "possessory");
    assert.equal(even?.parent, "custodial");
  });

  it("marks school-dependent boundaries", () => {
    const schedule = generatePossessionSchedule(d("2026-12-01"), d("2026-12-31"), {
      distanceMiles: 10,
    });
    const christmas = schedule.periods.find((p) => p.label === "Christmas, first half");
    assert.equal(christmas?.schoolDependent, true);
  });

  it("removes ordinary weekends that fall inside extended summer possession", () => {
    const schedule = generatePossessionSchedule(d("2026-06-25"), d("2026-08-10"), {
      distanceMiles: 20,
    });
    const summer = schedule.periods.find((p) => p.label.includes("Extended summer"));
    assert.ok(summer !== undefined);

    // Nothing kept may overlap the summer block.
    const overlapping = schedule.periods.filter(
      (p) =>
        p !== summer &&
        compareDates(p.start, summer.end) < 0 &&
        compareDates(p.end, summer.start) > 0,
    );
    assert.deepEqual(overlapping, []);

    // And the removals are reported rather than dropped silently.
    assert.ok(schedule.superseded.length >= 2);
    assert.ok(
      schedule.superseded.every((x) => x.supersededBy.includes("Extended summer possession")),
    );
  });

  it("produces no overlapping periods at all across a full year", () => {
    const schedule = generatePossessionSchedule(d("2026-01-01"), d("2026-12-31"), {
      distanceMiles: 20,
      possessoryParentRole: "father",
    });
    const sorted = [...schedule.periods];
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      assert.ok(previous !== undefined && current !== undefined);
      assert.ok(
        compareDates(previous.end, current.start) <= 0,
        `${previous.label} (ends ${previous.end}) overlaps ${current.label} (starts ${current.start})`,
      );
    }
  });

  it("lets holiday possession supersede summer, not the other way round", () => {
    const schedule = generatePossessionSchedule(d("2026-01-01"), d("2026-12-31"), {
      distanceMiles: 240,
    });
    const removedHolidays = schedule.superseded.filter(
      (x) => x.period.precedence === 3 && x.outcome === "removed",
    );
    assert.deepEqual(removedHolidays, []);
  });

  it("rejects an inverted range", () => {
    assert.throws(() =>
      generatePossessionSchedule(d("2026-05-01"), d("2026-01-01"), { distanceMiles: 5 }),
    );
  });
});

describe("venue", () => {
  it("resolves a Harris County Spring ZIP", () => {
    const answer = venueForZip("77373");
    assert.equal(answer.county, "Harris");
    assert.ok(answer.courts.every((c) => c.county === "Harris"));
  });

  it("flags the split ZIP", () => {
    const answer = venueForZip("77389");
    assert.equal(answer.county, "split");
    assert.ok(answer.caveats[0]?.includes("county line"));
  });

  it("does not silently guess an unknown ZIP", () => {
    const answer = venueForZip("90210");
    assert.ok(answer.caveats.some((c) => c.includes("not in this package")));
  });
});

describe("statute search", () => {
  it("ranks the child support cap provision first", () => {
    const hits = searchStatutes("child support guideline percentage cap");
    assert.equal(hits[0]?.citation, "Tex. Fam. Code § 154.125");
  });

  it("matches a plural topic word from a singular query", () => {
    const hits = searchStatutes("modification guideline");
    assert.ok(hits.some((h) => h.citation.includes("156")));
  });

  it("discards incidental word matches from an unrelated query", () => {
    // "claim" appears inside "claiming one exemption" in § 154.062; a lone
    // body-text hit must not surface as a citation.
    assert.equal(searchStatutes("patent infringement claim construction").length, 0);
  });
});

describe("safety screen", () => {
  it("catches family violence language", () => {
    const signals = screenForRisk("my husband hit me last night and I'm afraid for my life");
    assert.ok(signals.some((s) => s.category === "family_violence"));
  });

  it("catches self-harm language ahead of the legal question", () => {
    const signals = screenForRisk("I want to kill myself, also how do I file for divorce");
    assert.ok(signals.some((s) => s.category === "self_harm"));
  });

  it("stays quiet on an ordinary question", () => {
    assert.equal(screenForRisk("how is child support calculated in Texas?").length, 0);
  });
});

describe("case file", () => {
  it("merges updates and accumulates notes", () => {
    const store = new CaseFileStore();
    store.update({ county: "Harris", childrenCount: 2, note: "wants to modify support" });
    store.update({ monthlyNetResourcesUsd: 4200, note: "changed jobs in March" });
    const state = store.get();
    assert.equal(state.county, "Harris");
    assert.equal(state.childrenCount, 2);
    assert.equal(state.monthlyNetResourcesUsd, 4200);
    assert.equal(state.notes.length, 2);
  });

  it("returns a copy, not the live state", () => {
    const store = new CaseFileStore();
    const snapshot = store.get();
    snapshot.notes.push("mutated");
    assert.equal(store.get().notes.length, 0);
  });

  it("rejects an invalid ZIP", () => {
    const store = new CaseFileStore();
    assert.throws(() => store.update({ zip: "7737" }));
  });
});
