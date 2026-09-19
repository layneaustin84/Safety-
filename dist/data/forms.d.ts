/**
 * Pro se form packets and referral resources for Texas family matters.
 *
 * The agent never generates a court filing from scratch. It points the user at
 * the Supreme Court of Texas-approved packets on TexasLawHelp, which the
 * district clerks accept, and explains what each packet covers.
 */
export interface FormPacket {
    readonly id: string;
    readonly name: string;
    readonly covers: readonly string[];
    readonly url: string;
    readonly eligibility: string;
    readonly note?: string;
}
export declare const FORM_PACKETS: readonly FormPacket[];
export interface ReferralResource {
    readonly name: string;
    readonly serves: string;
    readonly contact: string;
    readonly url: string;
}
export declare const REFERRALS: readonly ReferralResource[];
/** Finds packets whose coverage matches a free-text need. */
export declare function findFormPackets(need: string, limit?: number): readonly FormPacket[];
