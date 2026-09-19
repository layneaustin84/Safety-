import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { COURTS, VERIFIED_AS_OF, venueForZip } from "../data/courts.js";
import { FORM_PACKETS, REFERRALS, findFormPackets } from "../data/forms.js";
import { searchStatutes } from "../data/statutes.js";
import { calculateGuidelineChildSupport } from "../domain/childSupport.js";
import { parseIsoDate, today } from "../domain/dates.js";
import { computeDeadlines } from "../domain/deadlines.js";
import { LONG_DISTANCE_THRESHOLD_MILES, generatePossessionSchedule, } from "../domain/possession.js";
const IsoDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .describe("Calendar date as YYYY-MM-DD.");
/** Serializes a tool result. Objects go back as JSON so the model can quote exact values. */
function json(value) {
    return JSON.stringify(value, null, 2);
}
/**
 * Wraps a tool body so a thrown error becomes a readable tool result instead of
 * killing the run. The model can then ask the user for a corrected input.
 */
async function guarded(fn) {
    try {
        return json(await fn());
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message, recoverable: true });
    }
}
export function buildTools(caseFile) {
    const childSupportTool = betaZodTool({
        name: "calculate_child_support",
        description: "Compute Texas guideline child support under Tex. Fam. Code ch. 154 from the " +
            "obligor's monthly net resources. Handles the statutory cap, the low-income " +
            "schedule, and the multiple-household table. Returns the guideline amount plus " +
            "the caveats that must be passed on to the user.",
        inputSchema: z.object({
            monthlyNetResourcesUsd: z
                .number()
                .min(0)
                .describe("Obligor's monthly net resources under § 154.062: gross income less Social " +
                "Security taxes, federal income tax for a single filer with one exemption, " +
                "union dues, and the children's health and dental premiums. Not gross pay."),
            childrenBeforeCourt: z
                .number()
                .int()
                .min(1)
                .describe("Number of children in this suit."),
            otherChildrenSupported: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Other children the obligor has a legal duty to support, if any."),
            asOf: IsoDateString.optional().describe("Date the order is calculated for. Defaults to today."),
        }),
        run: async (input) => guarded(() => calculateGuidelineChildSupport({
            monthlyNetResourcesUsd: input.monthlyNetResourcesUsd,
            childrenBeforeCourt: input.childrenBeforeCourt,
            asOf: parseIsoDate(input.asOf ?? today()),
            ...(input.otherChildrenSupported === undefined
                ? {}
                : { otherChildrenSupported: input.otherChildrenSupported }),
        })),
    });
    const possessionTool = betaZodTool({
        name: "build_possession_schedule",
        description: "Generate the Texas Standard Possession Order calendar for a date range: weekends, " +
            "Thursdays, alternating holidays, and summer possession. Selects the within-100-mile " +
            "or beyond-100-mile schedule automatically. School-dependent dates are flagged.",
        inputSchema: z.object({
            from: IsoDateString.describe("First date of the range."),
            to: IsoDateString.describe("Last date of the range. Keep ranges under about 18 months."),
            distanceMiles: z
                .number()
                .min(0)
                .describe(`Road distance between the two residences. Over ${LONG_DISTANCE_THRESHOLD_MILES} ` +
                "miles switches to the § 153.313 schedule."),
            expandedElection: z
                .boolean()
                .optional()
                .describe("True if the possessory conservator elected expanded possession under § 153.3171 " +
                "(pickup at school dismissal, return when school resumes)."),
            possessoryParentRole: z
                .enum(["mother", "father"])
                .optional()
                .describe("Role of the possessory conservator, needed for Mother's and Father's Day."),
        }),
        run: async (input) => guarded(() => {
            const options = {
                distanceMiles: input.distanceMiles,
                ...(input.expandedElection === undefined
                    ? {}
                    : { expandedElection: input.expandedElection }),
                ...(input.possessoryParentRole === undefined
                    ? {}
                    : { possessoryParentRole: input.possessoryParentRole }),
            };
            return generatePossessionSchedule(parseIsoDate(input.from), parseIsoDate(input.to), options);
        }),
    });
    const deadlineTool = betaZodTool({
        name: "compute_deadlines",
        description: "Compute the Texas deadlines that run from a case event: the answer date under " +
            "Tex. R. Civ. P. 99(b), the 60-day divorce waiting period, disclosure deadlines, " +
            "post-judgment and appellate deadlines, and protective order settings. Applies the " +
            "Rule 4 roll-forward past weekends and Texas court holidays.",
        inputSchema: z.object({
            event: z
                .enum([
                "petition_filed",
                "served_with_citation",
                "answer_filed",
                "final_decree_signed",
                "temporary_restraining_order_signed",
                "ex_parte_protective_order_signed",
                "trial_setting",
            ])
                .describe("The triggering event."),
            eventDate: IsoDateString.describe("Date the event occurred, or the trial setting date."),
        }),
        run: async (input) => guarded(() => computeDeadlines({ event: input.event, eventDate: parseIsoDate(input.eventDate) })),
    });
    const venueTool = betaZodTool({
        name: "find_venue",
        description: "Resolve a Spring-area ZIP code to its county and the courts and district clerk that " +
            "serve it, with the residency requirements for filing. Spring straddles the " +
            "Harris/Montgomery county line, so run this before telling a user where to file.",
        inputSchema: z.object({
            zip: z.string().describe("Five-digit ZIP code of the filing party's residence."),
        }),
        run: async (input) => guarded(() => venueForZip(input.zip)),
    });
    const statuteTool = betaZodTool({
        name: "search_family_code",
        description: "Search a curated Texas Family Code knowledge base for the provisions governing a " +
            "topic. Returns citations and summaries. Use this instead of reciting statute text " +
            "from memory. If nothing relevant comes back, say so rather than inventing a citation.",
        inputSchema: z.object({
            query: z
                .string()
                .min(3)
                .describe("Topic or keywords, e.g. 'modify child support three years' or 'spousal maintenance cap'."),
            limit: z.number().int().min(1).max(10).optional().describe("Maximum results. Default 5."),
        }),
        run: async (input) => guarded(() => {
            const hits = searchStatutes(input.query, input.limit ?? 5);
            return hits.length === 0
                ? {
                    hits: [],
                    note: "Nothing in the curated knowledge base matched. Tell the user this topic is " +
                        "outside the package's verified set and point them to the Texas Family Code " +
                        "on statutes.capitol.texas.gov rather than citing from memory.",
                }
                : { hits };
        }),
    });
    const formsTool = betaZodTool({
        name: "find_forms_and_referrals",
        description: "Find the Supreme Court of Texas-approved pro se form packet for a need, and the " +
            "legal aid, lawyer referral, child support, and domestic violence resources serving " +
            "the Spring area.",
        inputSchema: z.object({
            need: z
                .string()
                .describe("What the user is trying to do, e.g. 'uncontested divorce with kids'."),
            includeReferrals: z
                .boolean()
                .optional()
                .describe("Include the human-help referral list. Default true."),
        }),
        run: async (input) => guarded(() => {
            const packets = findFormPackets(input.need);
            return {
                packets: packets.length > 0 ? packets : FORM_PACKETS,
                ...(input.includeReferrals === false ? {} : { referrals: REFERRALS }),
                note: "Form packets are free. Filing fees are separate and can be waived under Tex. R. Civ. P. 145.",
            };
        }),
    });
    const caseFileTool = betaZodTool({
        name: "update_case_file",
        description: "Record a fact the user has given you so later tool calls and later turns reuse it " +
            "instead of asking again. Call this as facts arrive. Pass only the fields the user " +
            "actually stated; never guess a value to fill a field.",
        inputSchema: z.object({
            county: z.enum(["Harris", "Montgomery", "unknown"]).optional(),
            zip: z.string().regex(/^\d{5}$/).optional(),
            matterType: z
                .enum(["divorce", "sapcr", "modification", "enforcement", "protective_order", "other"])
                .optional(),
            hasExistingOrder: z.boolean().optional(),
            childrenCount: z.number().int().min(0).max(20).optional(),
            monthlyNetResourcesUsd: z.number().min(0).optional(),
            otherChildrenSupported: z.number().int().min(0).max(20).optional(),
            distanceBetweenHomesMiles: z.number().min(0).optional(),
            petitionFiledOn: IsoDateString.optional(),
            servedOn: IsoDateString.optional(),
            note: z.string().max(500).optional().describe("A short free-text fact worth remembering."),
        }),
        run: async (input) => guarded(() => caseFile.update(input)),
    });
    const readCaseFileTool = betaZodTool({
        name: "read_case_file",
        description: "Read back the facts recorded so far this session.",
        inputSchema: z.object({}),
        run: async () => guarded(() => caseFile.get()),
    });
    const courtDirectoryTool = betaZodTool({
        name: "list_courts",
        description: "List the family courts, district clerks, and self-help resources for a county, with " +
            "the date this package's records were last reviewed.",
        inputSchema: z.object({
            county: z.enum(["Harris", "Montgomery", "both"]).describe("County to list."),
        }),
        run: async (input) => guarded(() => ({
            verifiedAsOf: VERIFIED_AS_OF,
            courts: input.county === "both" ? COURTS : COURTS.filter((c) => c.county === input.county),
            caveat: "Confirm court numbers, addresses, and filing procedures against the linked " +
                "official page. These change without notice.",
        })),
    });
    return [
        childSupportTool,
        possessionTool,
        deadlineTool,
        venueTool,
        statuteTool,
        formsTool,
        courtDirectoryTool,
        caseFileTool,
        readCaseFileTool,
    ];
}
//# sourceMappingURL=index.js.map