/**
 * A curated Texas Family Code knowledge base.
 *
 * This is deliberately a small, hand-checked set of the provisions that drive
 * most Spring-area family matters, not a full code. Keeping it small means the
 * agent cites provisions this package can stand behind; anything outside the
 * set is answered by telling the user to read the code itself.
 */
export interface StatuteEntry {
    readonly citation: string;
    readonly title: string;
    readonly topics: readonly string[];
    readonly summary: string;
}
export declare const STATUTES: readonly StatuteEntry[];
export interface StatuteHit extends StatuteEntry {
    readonly score: number;
}
/**
 * Keyword search over the knowledge base.
 *
 * Deliberately a transparent scorer rather than an embedding index: the corpus
 * is small enough that lexical matching is exact and auditable, and it costs no
 * network round trip. Scoring weights topic hits above title hits above body
 * hits, so a query like "child support cap" ranks § 154.125 first.
 */
export declare function searchStatutes(query: string, limit?: number): readonly StatuteHit[];
