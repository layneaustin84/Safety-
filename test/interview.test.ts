import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CaseFileSchema, CaseFileStore, type CaseFile } from "../src/caseFile.ts";
import {
  CAPABILITIES,
  FACT_REQUIREMENTS,
  assessCaseFile,
  describeSelf,
} from "../src/interview.ts";

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
    assert.ok(partial.ready.every((c) => c.id !== "child_support"));

    const complete = assessCaseFile(
      caseFile({ matterType: "sapcr", childrenCount: 2, monthlyNetResourcesUsd: 4000 }),
    );
    assert.ok(complete.ready.some((c) => c.id === "child_support"));
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
