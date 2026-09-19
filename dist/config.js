import { z } from "zod";
/**
 * Runtime configuration, validated at startup so a bad value fails before the
 * first API call rather than mid-conversation.
 */
const ConfigSchema = z.object({
    /** Model id. Opus 5 is the default; thinking is on by default on this model. */
    model: z.string().min(1).default("claude-opus-5"),
    maxTokens: z.number().int().positive().max(128_000).default(32_000),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
    /** Cap on tool-calling iterations per user turn, to bound cost. */
    maxIterations: z.number().int().positive().max(50).default(12),
    /** Show the model's summarized reasoning in the CLI. */
    showThinking: z.boolean().default(false),
});
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}
function boolFromEnv(value) {
    if (value === undefined)
        return undefined;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function intFromEnv(value) {
    if (value === undefined)
        return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed))
        throw new ConfigError(`Expected an integer, got ${value}.`);
    return parsed;
}
/** Reads configuration from the environment, applying defaults. */
export function loadConfig(env = process.env) {
    const candidate = {
        model: env["TXFAM_MODEL"],
        maxTokens: intFromEnv(env["TXFAM_MAX_TOKENS"]),
        effort: env["TXFAM_EFFORT"],
        maxIterations: intFromEnv(env["TXFAM_MAX_ITERATIONS"]),
        showThinking: boolFromEnv(env["TXFAM_SHOW_THINKING"]),
    };
    // Strip undefined so zod's defaults apply.
    const cleaned = Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined));
    const parsed = ConfigSchema.safeParse(cleaned);
    if (!parsed.success) {
        throw new ConfigError(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return parsed.data;
}
/** Fails fast with an actionable message when no credential is resolvable. */
export function assertCredentialsPresent(env = process.env) {
    if (env["ANTHROPIC_API_KEY"] !== undefined || env["ANTHROPIC_AUTH_TOKEN"] !== undefined)
        return;
    // The SDK also resolves an `ant auth login` profile from disk, so this is a
    // warning path rather than a hard failure.
    process.stderr.write("No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment. " +
        "Falling back to an `ant auth login` profile if one exists; run `ant auth status` to check.\n");
}
//# sourceMappingURL=config.js.map