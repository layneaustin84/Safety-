import { z } from "zod";
/**
 * Runtime configuration, validated at startup so a bad value fails before the
 * first API call rather than mid-conversation.
 */
declare const ConfigSchema: z.ZodObject<{
    model: z.ZodDefault<z.ZodString>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    effort: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        max: "max";
    }>>;
    maxIterations: z.ZodDefault<z.ZodNumber>;
    showThinking: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type AgentConfig = z.infer<typeof ConfigSchema>;
export declare class ConfigError extends Error {
    constructor(message: string);
}
/** Reads configuration from the environment, applying defaults. */
export declare function loadConfig(env?: NodeJS.ProcessEnv): AgentConfig;
/** Fails fast with an actionable message when no credential is resolvable. */
export declare function assertCredentialsPresent(env?: NodeJS.ProcessEnv): void;
export {};
