/**
 * Safety and scope guardrails.
 *
 * Two jobs, both of which must run before the model sees a turn:
 *
 *  1. Screen for immediate danger. Family law and family violence overlap
 *     constantly, and a schedule question can carry a safety emergency inside
 *     it. When the screen fires, the agent leads with resources.
 *  2. Hold the unauthorized-practice-of-law line. This package produces legal
 *     information, not advice, and never files anything.
 */
export type RiskCategory = "family_violence" | "self_harm" | "child_safety" | "abduction";
export interface RiskSignal {
    readonly category: RiskCategory;
    readonly matched: readonly string[];
    readonly directive: string;
}
export declare function screenForRisk(text: string): readonly RiskSignal[];
/**
 * Builds the operator directive injected as a mid-conversation system message
 * when a screen fires. Returns `undefined` when nothing matched, so the cached
 * prompt prefix is left untouched on ordinary turns.
 */
export declare function riskDirective(text: string): string | undefined;
/** The standing scope disclosure, shown once per session and on request. */
export declare const SCOPE_DISCLOSURE = "This assistant provides legal *information* about the Texas family court system for the Spring, Texas area. It is not a lawyer, it cannot give legal advice about your specific case, and using it creates no attorney-client relationship and no confidentiality or privilege. It does not file documents, sign pleadings, appear in court, or calculate the final number a judge will order. Court rules, dollar thresholds, and court assignments change; verify everything against the official source before you rely on it. For advice about your case, consult a licensed Texas attorney.";
