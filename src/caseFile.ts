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
  priorOrderSignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  texasResidentSixMonths: z.boolean().optional(),
  countyResidentNinetyDays: z.boolean().optional(),
  paternityEstablished: z.boolean().optional(),
  childrenUnderThree: z.boolean().optional(),
  safetyConcernRaised: z.boolean().optional(),
  /**
   * Geographic restriction facts, kept flat so the interview can ask for them
   * one at a time. The verbatim fields are deliberately free text: the
   * controlling language is order-specific and must never be inferred.
   */
  geographicRestrictionExists: z.enum(["yes", "no", "unknown"]).optional(),
  geographicRestrictionAreaVerbatim: z.string().max(1000).optional(),
  geographicRestrictionAppliesTo: z
    .enum(["primary_conservator", "both_parents", "unknown"])
    .optional(),
  geographicRestrictionExceptionsVerbatim: z.string().max(1000).optional(),
  proposedRelocationDestination: z.string().max(200).optional(),
  seeksToModifyRestriction: z.boolean().optional(),
  notes: z.array(z.string()).default([]),
});

export type CaseFile = z.infer<typeof CaseFileSchema>;

/** Every field is optional and explicitly nullable so callers may spread partial input. */
export type CaseFileUpdate = {
  readonly [K in keyof Omit<CaseFile, "notes">]?: CaseFile[K] | undefined;
} & { readonly note?: string | undefined };

/** Mutable session store for gathered case facts. */
export class CaseFileStore {
  #state: CaseFile;

  public constructor(initial?: Partial<CaseFile>) {
    this.#state = CaseFileSchema.parse(initial ?? {});
  }

  public get(): CaseFile {
    return structuredClone(this.#state);
  }

  /** Merges an update, appending any note rather than overwriting the list. */
  public update(update: CaseFileUpdate): CaseFile {
    const { note, ...fields } = update;
    const defined = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    const next: CaseFile = CaseFileSchema.parse({
      ...this.#state,
      ...defined,
      notes: note === undefined ? this.#state.notes : [...this.#state.notes, note],
    });
    this.#state = next;
    return structuredClone(next);
  }

  public toJSON(): CaseFile {
    return this.get();
  }
}
