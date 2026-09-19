import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CaseFileSchema, CaseFileStore, type CaseFile } from "../src/caseFile.ts";
import { COURT_DIRECTORY_PROVENANCE } from "../src/data/courts.ts";
import { parseIsoDate, type IsoDate } from "../src/domain/dates.ts";
import { evaluateProvenance, readinessOf, type Provenance } from "../src/provenance.ts";
import {
  CAPABILITIES,
  FACT_REQUIREMENTS,
  assessCaseFile,
  describeSelf,
} from "../src/interview.ts";
import { analyzeGeographicRestriction } from "../src/domain/relocation.ts";

const caseFile = (partial: Partial<CaseFile> = {}): CaseFile => CaseFileSchema.parse(partial);

describe("case assessment", () => {
  it("asks about safety before anything else", () => {
    const assessment = assessCaseFile(caseFile());
    assert.equal(assessment.openQuestions[0]?.field, "safetyConcernRaised");
    assert.ok(assessment.suggestedNextQuestion?.includes("danger"));
  });

  it("asks what the matter is before asking for numbers", () => {
    const fields = assessCaseFile(caseFile()).openQuestions.map((q) => q.field);
    assert.ok(fields.indexOf("matterType") < fields.indexOf("monthlyNetResourcesUsd"));
    assert.ok(fields.indexOf("zip") < fields.indexOf("distanceBetweenHomesMiles"));
  });

  it("stops asking a question once the fact is known", () => {
    const before = assessCaseFile(caseFile()).openQuestions.length;
    const after = assessCaseFile(caseFile({ zip: "77373" })).openQuestions.length;
    assert.equal(after, before - 1);
    assert.ok(
      assessCaseFile(caseFile({ zip: "77373" })).openQuestions.every((q) => q.field !== "zip"),
    );
  });

  it("drops questions that do not apply to the matter type", () => {
    const divorce = assessCaseFile(caseFile({ matterType: "divorce" })).openQuestions;
    const modification = assessCaseFile(caseFile({ matterType: "modification" })).openQuestions;
    assert.ok(divorce.some((q) => q.field === "texasResidentSixMonths"));
    assert.ok(modification.every((q) => q.field !== "texasResidentSixMonths"));
    assert.ok(modification.some((q) => q.field === "priorOrderSignedOn"));
  });

  it("keeps every question in view before the matter type is known", () => {
    const unknown = assessCaseFile(caseFile()).openQuestions;
    assert.equal(unknown.length, FACT_REQUIREMENTS.length);
  });

  it("reports a capability as blocked with the fact that blocks it", () => {
    const assessment = assessCaseFile(caseFile({ matterType: "sapcr" }));
    const support = assessment.blocked.find((c) => c.id === "child_support");
    assert.ok(support !== undefined);
    assert.deepEqual([...support.missing].sort(), ["childrenCount", "monthlyNetResourcesUsd"]);
  });

  it("unlocks a capability when its last missing fact arrives", () => {
    const partial = assessCaseFile(caseFile({ matterType: "sapcr", childrenCount: 2 }));
    assert.ok(partial.blocked.some((c) => c.id === "child_support"));

    const complete = assessCaseFile(
      caseFile({ matterType: "sapcr", childrenCount: 2, monthlyNetResourcesUsd: 4000 }),
    );
    assert.ok(complete.blocked.every((c) => c.id !== "child_support"));
  });

  it("downgrades support to requires_verification while the cap is unconfirmed", () => {
    // The facts are complete, so this is not a missing-fact problem. The
    // capability is held back by its own reference data, automatically.
    const assessment = assessCaseFile(
      caseFile({ matterType: "sapcr", childrenCount: 2, monthlyNetResourcesUsd: 4000 }),
    );
    const support = assessment.requiresVerification.find((c) => c.id === "child_support");
    assert.ok(support !== undefined);
    assert.equal(support.state, "requires_verification");
    assert.deepEqual(support.missing, []);
    assert.equal(support.verification?.[0]?.id, "support_cap");
    assert.equal(support.verification?.[0]?.concern, "unverified");
    assert.equal(support.verification?.[0]?.provenance.verificationStatus, "unverified");
    assert.ok(support.verification?.[0]?.provenance.sourceUrl.startsWith("https://"));
    assert.ok(assessment.ready.every((c) => c.id !== "child_support"));
  });

  it("leaves capabilities with no reference dependency fully ready", () => {
    const assessment = assessCaseFile(
      caseFile({ childrenCount: 2, distanceBetweenHomesMiles: 8 }),
    );
    assert.ok(assessment.ready.some((c) => c.id === "possession_schedule"));
  });

  it("asks for relocation facts only on matters where a move is in play", () => {
    const modification = assessCaseFile(caseFile({ matterType: "modification" })).openQuestions;
    const divorce = assessCaseFile(caseFile({ matterType: "divorce" })).openQuestions;
    assert.ok(modification.some((q) => q.field === "geographicRestrictionExists"));
    assert.ok(divorce.every((q) => q.field !== "geographicRestrictionAreaVerbatim"));
  });

  it("treats any one of several dates as enough for deadlines", () => {
    const withService = assessCaseFile(caseFile({ servedOn: "2026-09-21" }));
    assert.ok(withService.ready.some((c) => c.id === "case_deadlines"));

    const withPriorOrder = assessCaseFile(caseFile({ priorOrderSignedOn: "2024-02-02" }));
    assert.ok(withPriorOrder.ready.some((c) => c.id === "case_deadlines"));
  });

  it("does not count an unknown county as known", () => {
    const assessment = assessCaseFile(caseFile({ county: "unknown" }));
    assert.equal(assessment.known["county"], undefined);
  });

  it("reaches full completeness when every applicable fact is answered", () => {
    // An explicit map rather than a heuristic, so a new field with an
    // unexpected name fails this test loudly instead of being guessed at.
    const answers: Record<string, unknown> = {
      safetyConcernRaised: false,
      matterType: "modification",
      zip: "77373",
      hasExistingOrder: true,
      childrenCount: 2,
      texasResidentSixMonths: true,
      countyResidentNinetyDays: true,
      paternityEstablished: true,
      monthlyNetResourcesUsd: 4200,
      otherChildrenSupported: 0,
      distanceBetweenHomesMiles: 15,
      childrenUnderThree: false,
      geographicRestrictionExists: "yes",
      geographicRestrictionAreaVerbatim: "Harris County and contiguous counties",
      geographicRestrictionAppliesTo: "primary_conservator",
      geographicRestrictionExceptionsVerbatim: "none",
      proposedRelocationDestination: "Dallas, Texas",
      priorOrderSignedOn: "2024-02-02",
      petitionFiledOn: "2026-01-05",
      servedOn: "2026-01-12",
    };

    const store = new CaseFileStore();
    for (const requirement of FACT_REQUIREMENTS) {
      const value = answers[requirement.field];
      assert.notEqual(value, undefined, `no test answer for ${requirement.field}`);
      store.update({ [requirement.field]: value } as never);
    }

    const assessment = assessCaseFile(store.get());
    assert.equal(assessment.completeness, 1);
    assert.equal(assessment.openQuestions.length, 0);
    assert.equal(assessment.suggestedNextQuestion, undefined);
    assert.equal(assessment.blocked.length, 0);
  });
});

describe("self description", () => {
  it("lists every capability the engine defines", () => {
    assert.equal(describeSelf().capabilities.length, CAPABILITIES.length);
  });

  it("discloses the unverified support cap rather than hiding it", () => {
    assert.ok(describeSelf().knownLimits.some((l) => l.includes("September 1")));
  });

  it("discloses that it has no memory between sessions", () => {
    assert.ok(describeSelf().knownLimits.some((l) => l.toLowerCase().includes("memory")));
  });

  it("states the boundaries it will not cross", () => {
    const willNot = describeSelf().willNotDo.join(" ").toLowerCase();
    assert.ok(willNot.includes("predict how a judge"));
    assert.ok(willNot.includes("draft"));
  });
});

describe("geographic restriction analysis", () => {
  it("refuses to proceed without knowing whether a restriction exists", () => {
    const analysis = analyzeGeographicRestriction({ exists: "unknown" });
    assert.equal(analysis.determination, "restriction_status_unknown");
    assert.ok(analysis.needed.length > 0);
  });

  it("will not guess the restriction's wording", () => {
    const analysis = analyzeGeographicRestriction({
      exists: "yes",
      proposedDestination: "Dallas, Texas",
      appliesTo: "primary_conservator",
    });
    assert.equal(analysis.determination, "requires_order_language");
    assert.ok(analysis.needed.some((n) => n.includes("exact wording")));
    // It must not have invented a typical Texas restriction to reason from.
    assert.ok(!analysis.summary.includes("contiguous"));
  });

  it("stops short of deciding whether a move complies", () => {
    const analysis = analyzeGeographicRestriction({
      exists: "yes",
      areaVerbatim: "Harris County, Texas",
      appliesTo: "primary_conservator",
      proposedDestination: "Dallas, Texas",
    });
    assert.equal(analysis.determination, "requires_legal_judgment");
    assert.ok(analysis.summary.includes("Harris County, Texas"));
    assert.ok(analysis.summary.includes("Dallas, Texas"));
    const text = `${analysis.summary} ${analysis.nextSteps.join(" ")}`.toLowerCase();
    assert.ok(!text.includes("you may move"));
    assert.ok(!text.includes("is prohibited"));
  });

  it("treats a request to change the restriction as a modification suit", () => {
    const analysis = analyzeGeographicRestriction({
      exists: "yes",
      areaVerbatim: "Spring Independent School District",
      appliesTo: "both_parents",
      proposedDestination: "Conroe, Texas",
      seeksToModifyRestriction: true,
    });
    assert.ok(analysis.summary.includes("156.101"));
  });

  it("still warns when no restriction is reported", () => {
    const analysis = analyzeGeographicRestriction({ exists: "no" });
    assert.equal(analysis.determination, "no_restriction_reported");
    assert.ok(analysis.nextSteps.some((s) => s.toLowerCase().includes("notice")));
    assert.ok(analysis.caveats.some((c) => c.toLowerCase().includes("vary")));
  });
});

describe("provenance: verification and freshness are separate dimensions", () => {
  const asOf = (value: string): IsoDate => parseIsoDate(value);

  const verified: Provenance = {
    id: "court_directory",
    verificationStatus: "verified",
    effectiveDate: "2026-01-01",
    source: "test source",
    sourceUrl: "https://example.invalid/",
    lastChecked: "2026-01-01",
    maxAgeDays: 90,
    note: "Confirmed when written.",
  };

  it("verified and within the interval is ready", () => {
    const evaluation = evaluateProvenance(verified, asOf("2026-03-01"));
    assert.equal(evaluation.readiness, "ready");
    assert.equal(evaluation.concern, undefined);
    assert.equal(evaluation.ageDays, 59);
    assert.equal(evaluation.staleAfter, "2026-04-01");
  });

  it("verified but past the interval requires verification, as stale", () => {
    const evaluation = evaluateProvenance(verified, asOf("2026-06-01"));
    assert.equal(evaluation.readiness, "requires_verification");
    assert.equal(evaluation.concern, "stale");
    assert.equal(evaluation.ageDays, 151);
  });

  it("treats the boundary day itself as still fresh", () => {
    assert.equal(evaluateProvenance(verified, asOf("2026-04-01")).readiness, "ready");
    assert.equal(evaluateProvenance(verified, asOf("2026-04-02")).concern, "stale");
  });

  it("unverified requires verification regardless of how recently it was checked", () => {
    const fresh: Provenance = {
      ...verified,
      id: "support_cap",
      verificationStatus: "unverified",
      lastChecked: "2026-01-01",
    };
    const evaluation = evaluateProvenance(fresh, asOf("2026-01-02"));
    assert.equal(evaluation.readiness, "requires_verification");
    assert.equal(evaluation.concern, "unverified");
  });

  it("names the unverified concern when a source is both unverified and stale", () => {
    const both: Provenance = { ...verified, verificationStatus: "unverified" };
    assert.equal(evaluateProvenance(both, asOf("2027-01-01")).concern, "unverified");
  });

  it("aggregates: one unready source makes the whole set unready", () => {
    const stale: Provenance = { ...verified, lastChecked: "2020-01-01" };
    assert.equal(readinessOf([verified], asOf("2026-02-01")), "ready");
    assert.equal(readinessOf([verified, stale], asOf("2026-02-01")), "requires_verification");
  });
});

describe("capability readiness follows its reference data", () => {
  const complete = CaseFileSchema.parse({
    matterType: "modification",
    zip: "77373",
    childrenCount: 2,
    monthlyNetResourcesUsd: 5200,
    distanceBetweenHomesMiles: 8,
  });

  it("court-directory capabilities are ready while the directory is fresh", () => {
    const freshDay = parseIsoDate(COURT_DIRECTORY_PROVENANCE.lastChecked);
    const assessment = assessCaseFile(complete, freshDay);
    assert.ok(assessment.ready.some((c) => c.id === "venue"));
    assert.ok(assessment.ready.some((c) => c.id === "forms_and_referrals"));
  });

  it("the same capabilities go to requires_verification once it goes stale", () => {
    const assessment = assessCaseFile(complete, parseIsoDate("2027-01-01"));
    const forms = assessment.requiresVerification.find((c) => c.id === "forms_and_referrals");
    assert.ok(forms !== undefined);
    assert.equal(forms.verification?.[0]?.id, "court_directory");
    assert.equal(forms.verification?.[0]?.concern, "stale");
    assert.deepEqual(forms.missing, []);
    assert.ok(assessment.ready.every((c) => c.id !== "venue"));
  });

  it("support stays unverified no matter which day it is assessed on", () => {
    for (const day of ["2026-05-02", "2027-01-01"]) {
      const assessment = assessCaseFile(complete, parseIsoDate(day));
      const support = assessment.requiresVerification.find((c) => c.id === "child_support");
      assert.ok(support !== undefined, `child_support should need verification on ${day}`);
      assert.equal(support.verification?.[0]?.concern, "unverified");
    }
  });

  it("a missing fact outranks a verification concern", () => {
    // Blocked means "I cannot do this at all", which is a different message to
    // the user than "I can, but confirm the figure first". Blocked must win.
    const assessment = assessCaseFile(
      CaseFileSchema.parse({ matterType: "modification" }),
      parseIsoDate("2027-01-01"),
    );
    const support = assessment.blocked.find((c) => c.id === "child_support");
    assert.ok(support !== undefined);
    assert.equal(support.state, "blocked");
    assert.ok(support.missing.length > 0);
    assert.ok(assessment.requiresVerification.every((c) => c.id !== "child_support"));
  });

  it("possession has no reference dependency and is unaffected by any date", () => {
    for (const day of ["2026-05-01", "2030-01-01"]) {
      const assessment = assessCaseFile(complete, parseIsoDate(day));
      assert.ok(assessment.ready.some((c) => c.id === "possession_schedule"));
    }
  });
});
