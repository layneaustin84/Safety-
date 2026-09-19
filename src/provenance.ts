/**
 * Machine-readable provenance for reference data.
 *
 * A caveat string is only as good as the model's willingness to repeat it. Any
 * value whose correctness depends on an external publication carries this
 * record instead, so callers can branch on it: a capability resting on data
 * that cannot be stood behind reports `requires_verification` rather than
 * `ready`, without anything having to remember a warning.
 *
 * Verification and freshness are separate dimensions and are stored separately.
 * `verificationStatus` says whether the figure was ever confirmed against its
 * source. Freshness says whether that confirmation is recent enough to still
 * mean something, and is derived from `lastChecked` against a per-source
 * `maxAgeDays` policy. A court directory goes stale without any legal rule
 * changing; a statutory cap can be unverified the day it is published. Folding
 * both into one enum would lose the distinction and the reason for it.
 */

import type { IsoDate } from "./domain/dates.ts";
import { differenceInDays, parseIsoDate } from "./domain/dates.ts";

/** Stable identifier for a reference source, so dependencies can be named. */
export type SourceId = "support_cap" | "court_directory";

export type VerificationStatus = "verified" | "unverified";

export interface Provenance {
  readonly id: SourceId;
  readonly verificationStatus: VerificationStatus;
  /** When the value took legal effect. */
  readonly effectiveDate: string;
  /** Who publishes the authoritative figure. */
  readonly source: string;
  /** Where to confirm it. */
  readonly sourceUrl: string;
  /** When this package last checked the source. */
  readonly lastChecked: string;
  /**
   * How long a confirmation stays good for this source. Set it from how fast
   * the underlying data actually moves, not from how stable the law is.
   */
  readonly maxAgeDays: number;
  /** Why the status is what it is, in one sentence. */
  readonly note: string;
}

/** Readiness of a computed result that depends on reference data. */
export type Readiness = "ready" | "requires_verification";

export type ProvenanceConcern = "unverified" | "stale";

export interface ProvenanceEvaluation {
  readonly id: SourceId;
  readonly readiness: Readiness;
  /** Absent when the source is ready. */
  readonly concern?: ProvenanceConcern;
  readonly ageDays: number;
  /** The date after which this confirmation goes stale. */
  readonly staleAfter: IsoDate;
  readonly provenance: Provenance;
}

/**
 * Resolves a source against a date.
 *
 * The transitions are exactly:
 *   unverified                  -> requires_verification (concern: unverified)
 *   verified, within maxAgeDays -> ready
 *   verified, beyond maxAgeDays -> requires_verification (concern: stale)
 *
 * `unverified` wins over `stale` when both apply, because re-confirming the
 * figure resolves them together and naming the weaker concern would understate
 * the problem.
 */
export function evaluateProvenance(provenance: Provenance, asOf: IsoDate): ProvenanceEvaluation {
  const lastChecked = parseIsoDate(provenance.lastChecked);
  const ageDays = differenceInDays(lastChecked, asOf);
  const staleAfter = parseIsoDate(provenance.lastChecked) as IsoDate;

  const base = {
    id: provenance.id,
    ageDays,
    staleAfter: addDaysIso(staleAfter, provenance.maxAgeDays),
    provenance,
  } as const;

  if (provenance.verificationStatus === "unverified") {
    return { ...base, readiness: "requires_verification", concern: "unverified" };
  }
  if (ageDays > provenance.maxAgeDays) {
    return { ...base, readiness: "requires_verification", concern: "stale" };
  }
  return { ...base, readiness: "ready" };
}

// Local rather than imported to keep this module's dependency on date math to
// the two functions it actually needs.
function addDaysIso(value: IsoDate, days: number): IsoDate {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return parseIsoDate(date.toISOString().slice(0, 10));
}

/** The aggregate readiness of everything a capability rests on. */
export function readinessOf(sources: readonly Provenance[], asOf: IsoDate): Readiness {
  return sources.some((s) => evaluateProvenance(s, asOf).readiness === "requires_verification")
    ? "requires_verification"
    : "ready";
}

/** Only the sources holding a result back, for reporting. */
export function concerningSources(
  sources: readonly Provenance[],
  asOf: IsoDate,
): readonly ProvenanceEvaluation[] {
  return sources
    .map((s) => evaluateProvenance(s, asOf))
    .filter((e) => e.readiness === "requires_verification");
}

/** One line a caller can show the user without restating the whole record. */
export function explainConcern(evaluation: ProvenanceEvaluation): string {
  const { provenance, concern, ageDays } = evaluation;
  if (concern === "unverified") {
    return `${provenance.note} Confirm at ${provenance.sourceUrl}.`;
  }
  return (
    `This was last confirmed ${ageDays} days ago against ${provenance.source}, past the ` +
    `${provenance.maxAgeDays}-day review interval for this source. The underlying rule may ` +
    `not have changed, but the details drift. Confirm at ${provenance.sourceUrl}.`
  );
}
