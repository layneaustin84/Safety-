import { z } from "zod";
/**
 * The facts the agent has gathered about the user's matter.
 *
 * Held in memory for the session and optionally mirrored to disk by the CLI.
 * Everything here is sensitive: names of children, income, addresses, and
 * allegations of violence. Nothing is written anywhere unless the caller opts
 * in with an explicit path.
 */
export const CaseFileSchema = z.object({
    county: z.enum(["Harris", "Montgomery", "unknown"]).default("unknown"),
    zip: z.string().regex(/^\d{5}$/).optional(),
    matterType: z
        .enum(["divorce", "sapcr", "modification", "enforcement", "protective_order", "other"])
        .optional(),
    hasExistingOrder: z.boolean().optional(),
    childrenCount: z.number().int().min(0).max(20).optional(),
    monthlyNetResourcesUsd: z.number().min(0).optional(),
    otherChildrenSupported: z.number().int().min(0).max(20).optional(),
    distanceBetweenHomesMiles: z.number().min(0).optional(),
    petitionFiledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    servedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.array(z.string()).default([]),
});
/** Mutable session store for gathered case facts. */
export class CaseFileStore {
    #state;
    constructor(initial) {
        this.#state = CaseFileSchema.parse(initial ?? {});
    }
    get() {
        return structuredClone(this.#state);
    }
    /** Merges an update, appending any note rather than overwriting the list. */
    update(update) {
        const { note, ...fields } = update;
        const defined = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
        const next = CaseFileSchema.parse({
            ...this.#state,
            ...defined,
            notes: note === undefined ? this.#state.notes : [...this.#state.notes, note],
        });
        this.#state = next;
        return structuredClone(next);
    }
    toJSON() {
        return this.get();
    }
}
//# sourceMappingURL=caseFile.js.map