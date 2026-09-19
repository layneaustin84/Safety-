import { z } from "zod";
/**
 * The facts the agent has gathered about the user's matter.
 *
 * Held in memory for the session and optionally mirrored to disk by the CLI.
 * Everything here is sensitive: names of children, income, addresses, and
 * allegations of violence. Nothing is written anywhere unless the caller opts
 * in with an explicit path.
 */
export declare const CaseFileSchema: z.ZodObject<{
    county: z.ZodDefault<z.ZodEnum<{
        Harris: "Harris";
        Montgomery: "Montgomery";
        unknown: "unknown";
    }>>;
    zip: z.ZodOptional<z.ZodString>;
    matterType: z.ZodOptional<z.ZodEnum<{
        divorce: "divorce";
        sapcr: "sapcr";
        modification: "modification";
        enforcement: "enforcement";
        protective_order: "protective_order";
        other: "other";
    }>>;
    hasExistingOrder: z.ZodOptional<z.ZodBoolean>;
    childrenCount: z.ZodOptional<z.ZodNumber>;
    monthlyNetResourcesUsd: z.ZodOptional<z.ZodNumber>;
    otherChildrenSupported: z.ZodOptional<z.ZodNumber>;
    distanceBetweenHomesMiles: z.ZodOptional<z.ZodNumber>;
    petitionFiledOn: z.ZodOptional<z.ZodString>;
    servedOn: z.ZodOptional<z.ZodString>;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CaseFile = z.infer<typeof CaseFileSchema>;
/** Every field is optional and explicitly nullable so callers may spread partial input. */
export type CaseFileUpdate = {
    readonly [K in keyof Omit<CaseFile, "notes">]?: CaseFile[K] | undefined;
} & {
    readonly note?: string | undefined;
};
/** Mutable session store for gathered case facts. */
export declare class CaseFileStore {
    #private;
    constructor(initial?: Partial<CaseFile>);
    get(): CaseFile;
    /** Merges an update, appending any note rather than overwriting the list. */
    update(update: CaseFileUpdate): CaseFile;
    toJSON(): CaseFile;
}
