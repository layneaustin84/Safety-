/**
 * Machine-readable provenance for reference data.
 *
 * A caveat string is only as good as the model's willingness to repeat it. Any
 * value whose correctness depends on an external publication that may have
 * moved carries this record instead, so callers can branch on it: a capability
 * resting on unverified data reports `requires_verification` rather than
 * `ready`, without anything having to remember a warning.
 */

export type VerificationStatus = "verified" | "unverified" | "superseded";

export interface Provenance {
  readonly verificationStatus: VerificationStatus;
  /** When the value took legal effect. */
  readonly effectiveDate: string;
  /** Who publishes the authoritative figure. */
  readonly source: string;
  /** Where to confirm it. */
  readonly sourceUrl: string;
  /** When this package last checked the source. */
  readonly lastChecked: string;
  /** Why the status is what it is, in one sentence. */
  readonly note: string;
}

/** True when a value must be confirmed before anyone relies on a number built from it. */
export function needsVerification(provenance: Provenance): boolean {
  return provenance.verificationStatus === "unverified";
}

/** Readiness of a computed result that depends on reference data. */
export type Readiness = "ready" | "requires_verification";

export function readinessOf(sources: readonly Provenance[]): Readiness {
  return sources.some(needsVerification) ? "requires_verification" : "ready";
}
