import Anthropic from "@anthropic-ai/sdk";

import { CaseFileStore, type CaseFile } from "./caseFile.ts";
import { type AgentConfig, loadConfig } from "./config.ts";
import { today } from "./domain/dates.ts";
import { riskDirective } from "./guardrails.ts";
import { SYSTEM_PROMPT, sessionContext } from "./prompt.ts";
import { buildTools } from "./tools/index.ts";

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

export class AgentError extends Error {
  public override readonly cause?: unknown;
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AgentError";
    if (cause !== undefined) this.cause = cause;
  }
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
export class FamilyLawAgent {
  readonly #client: Anthropic;
  readonly #config: AgentConfig;
  readonly #caseFile: CaseFileStore;
  readonly #tools: ReturnType<typeof buildTools>;
  #messages: Anthropic.Beta.BetaMessageParam[] = [];
  #started = false;

  public constructor(options?: {
    readonly client?: Anthropic;
    readonly config?: AgentConfig;
    readonly caseFile?: CaseFileStore;
  }) {
    this.#client = options?.client ?? new Anthropic();
    this.#config = options?.config ?? loadConfig();
    this.#caseFile = options?.caseFile ?? new CaseFileStore();
    this.#tools = buildTools(this.#caseFile);
  }

  public get caseFile(): CaseFile {
    return this.#caseFile.get();
  }

  public get config(): AgentConfig {
    return this.#config;
  }

  /** Runs one user turn to completion, streaming output through `events`. */
  public async send(userMessage: string, events: AgentEvents = {}): Promise<TurnResult> {
    const trimmed = userMessage.trim();
    if (trimmed.length === 0) throw new AgentError("Message is empty.");

    // Today's date is volatile, so it rides in the first user turn rather than
    // the system prompt, which stays byte-stable as a cache prefix.
    const content = this.#started ? trimmed : `${sessionContext(today())}\n\n${trimmed}`;
    this.#started = true;
    this.#messages.push({ role: "user", content });

    // The safety screen speaks as the operator, not as the user, so it goes in
    // as a mid-conversation system message. That keeps it outside the channel a
    // hostile input could imitate, and leaves the cached prefix untouched.
    const directive = riskDirective(trimmed);
    if (directive !== undefined) {
      events.onSafetyScreen?.(directive);
      this.#messages.push({ role: "system", content: directive });
    }

    const toolsCalled: string[] = [];
    let finalMessage: Anthropic.Beta.BetaMessage | undefined;

    try {
      const runner = this.#client.beta.messages.toolRunner({
        model: this.#config.model,
        max_tokens: this.#config.maxTokens,
        max_iterations: this.#config.maxIterations,
        stream: true,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: { effort: this.#config.effort },
        thinking: {
          type: "adaptive",
          display: this.#config.showThinking ? "summarized" : "omitted",
        },
        tools: this.#tools,
        messages: this.#messages,
      });

      for await (const stream of runner) {
        stream.on("text", (delta) => events.onText?.(delta));
        if (this.#config.showThinking && events.onThinking !== undefined) {
          stream.on("thinking", (delta) => events.onThinking?.(delta));
        }

        const message = await stream.finalMessage();
        finalMessage = message;

        for (const block of message.content) {
          if (block.type === "tool_use") {
            toolsCalled.push(block.name);
            events.onToolUse?.(block.name, block.input);
          }
        }

        // No server tools are declared here, but a paused turn would otherwise
        // end the loop silently with a truncated answer.
        if (message.stop_reason === "pause_turn") {
          runner.pushMessages({ role: "assistant", content: message.content });
        }
      }
    } catch (error) {
      // Roll the turn back so a failed request does not corrupt the transcript.
      this.#messages = this.#messages.slice(0, this.#messages.length - (directive === undefined ? 1 : 2));
      throw this.#wrap(error);
    }

    if (finalMessage === undefined) {
      this.#messages.pop();
      throw new AgentError("The model returned no message.");
    }

    if (finalMessage.stop_reason === "refusal") {
      this.#messages.pop();
      throw new AgentError(
        `The request was declined by a safety classifier${
          finalMessage.stop_details?.category === undefined
            ? ""
            : ` (${finalMessage.stop_details.category})`
        }. Rephrase the question, or consult a licensed Texas attorney directly.`,
      );
    }

    // Keep only the final assistant turn. Thinking blocks are echoed back
    // unchanged, as required when continuing on the same model.
    this.#messages.push({ role: "assistant", content: finalMessage.content });

    const text = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (finalMessage.stop_reason === "max_tokens") {
      events.onText?.("\n\n[Response truncated at the token limit. Ask for the rest.]");
    }

    return {
      text,
      stopReason: finalMessage.stop_reason,
      usage: finalMessage.usage,
      toolsCalled,
      caseFile: this.#caseFile.get(),
    };
  }

  /** Clears the transcript while keeping the gathered case facts. */
  public resetTranscript(): void {
    this.#messages = [];
    this.#started = false;
  }

  #wrap(error: unknown): AgentError {
    if (error instanceof Anthropic.AuthenticationError) {
      return new AgentError(
        "Authentication failed. Set ANTHROPIC_API_KEY or run `ant auth login`.",
        error,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new AgentError("Rate limited by the API. Wait a moment and try again.", error);
    }
    if (error instanceof Anthropic.BadRequestError) {
      return new AgentError(`The API rejected the request: ${error.message}`, error);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new AgentError("Could not reach the API. Check network connectivity.", error);
    }
    if (error instanceof Anthropic.APIError) {
      return new AgentError(`API error ${error.status ?? "unknown"}: ${error.message}`, error);
    }
    return new AgentError(error instanceof Error ? error.message : String(error), error);
  }
}
