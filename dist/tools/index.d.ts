import type { CaseFileStore } from "../caseFile.ts";
export declare function buildTools(caseFile: CaseFileStore): (import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    monthlyNetResourcesUsd: number;
    childrenBeforeCourt: number;
    otherChildrenSupported?: number | undefined;
    asOf?: string | undefined;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    from: string;
    to: string;
    distanceMiles: number;
    expandedElection?: boolean | undefined;
    possessoryParentRole?: "mother" | "father" | undefined;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    event: "petition_filed" | "served_with_citation" | "answer_filed" | "final_decree_signed" | "temporary_restraining_order_signed" | "ex_parte_protective_order_signed" | "trial_setting";
    eventDate: string;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    zip: string;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    query: string;
    limit?: number | undefined;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    need: string;
    includeReferrals?: boolean | undefined;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    county?: "Harris" | "Montgomery" | "unknown" | undefined;
    zip?: string | undefined;
    matterType?: "divorce" | "sapcr" | "modification" | "enforcement" | "protective_order" | "other" | undefined;
    hasExistingOrder?: boolean | undefined;
    childrenCount?: number | undefined;
    monthlyNetResourcesUsd?: number | undefined;
    otherChildrenSupported?: number | undefined;
    distanceBetweenHomesMiles?: number | undefined;
    petitionFiledOn?: string | undefined;
    servedOn?: string | undefined;
    note?: string | undefined;
}> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<Record<string, never>> | import("@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs").BetaRunnableTool<{
    county: "Harris" | "Montgomery" | "both";
}>)[];
export type AgentTools = ReturnType<typeof buildTools>;
