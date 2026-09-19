/** Public surface of the Texas family law information agent. */
export { FamilyLawAgent, AgentError } from "./agent.ts";
export type { AgentEvents, TurnResult } from "./agent.ts";
export { loadConfig, ConfigError, type AgentConfig } from "./config.ts";
export { CaseFileStore, CaseFileSchema, type CaseFile } from "./caseFile.ts";
export { SCOPE_DISCLOSURE, screenForRisk, riskDirective } from "./guardrails.ts";
export type { RiskCategory, RiskSignal } from "./guardrails.ts";
export { SYSTEM_PROMPT } from "./prompt.ts";
export { buildTools } from "./tools/index.ts";
export * from "./domain/dates.ts";
export * from "./domain/childSupport.ts";
export * from "./domain/possession.ts";
export * from "./domain/deadlines.ts";
export * from "./data/courts.ts";
export * from "./data/statutes.ts";
export * from "./data/forms.ts";
