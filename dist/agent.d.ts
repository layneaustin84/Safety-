import Anthropic from "@anthropic-ai/sdk";
import { CaseFileStore, type CaseFile } from "./caseFile.ts";
import { type AgentConfig } from "./config.ts";
export interface AgentEvents {
    /** Streamed assistant text. */
    readonly onText?: (delta: string) => void;
    /** Summarized reasoning, when `showThinking` is on. */
    readonly onThinking?: (delta: string) => void;
    /** Fired when the model calls a tool, before it runs. */
    readonly onToolUse?: (name: string, input: unknown) => void;
    /** Fired when the safety screen injects an operator directive. */
    readonly onSafetyScreen?: (directive: string) => void;
}
export interface TurnResult {
    readonly text: string;
    readonly stopReason: Anthropic.Beta.BetaMessage["stop_reason"];
    readonly usage: Anthropic.Beta.BetaUsage;
    readonly toolsCalled: readonly string[];
    readonly caseFile: CaseFile;
}
export declare class AgentError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
/**
 * The Texas family law information agent.
 *
 * Conversation state is kept in two places on purpose. The transcript holds
 * final assistant turns, which keeps the history small and valid across turns.
 * The durable facts — county, income, dates, number of children — live in the
 * case file store, which the model reads and writes through tools. That split
 * means a long session does not re-send every intermediate tool payload, and
 * the facts survive even when the transcript is trimmed.
 */
export declare class FamilyLawAgent {
    #private;
    constructor(options?: {
        readonly client?: Anthropic;
        readonly config?: AgentConfig;
        readonly caseFile?: CaseFileStore;
    });
    get caseFile(): CaseFile;
    get config(): AgentConfig;
    /** Runs one user turn to completion, streaming output through `events`. */
    send(userMessage: string, events?: AgentEvents): Promise<TurnResult>;
    /** Clears the transcript while keeping the gathered case facts. */
    resetTranscript(): void;
}
