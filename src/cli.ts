#!/usr/bin/env node
/**
 * Interactive CLI for the Texas family law information agent.
 *
 * Offline subcommands (`support`, `schedule`, `deadlines`, `venue`) run the
 * calculators directly with no API call, which makes them usable as a quick
 * reference and as a smoke test that needs no credentials.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { FamilyLawAgent, AgentError } from "./agent.ts";
import { assertCredentialsPresent, ConfigError, loadConfig } from "./config.ts";
import { venueForZip } from "./data/courts.ts";
import { calculateGuidelineChildSupport } from "./domain/childSupport.ts";
import { formatLong, parseIsoDate, today } from "./domain/dates.ts";
import { computeDeadlines, formatDeadline, type TriggerEvent } from "./domain/deadlines.ts";
import { generatePossessionSchedule } from "./domain/possession.ts";
import { SCOPE_DISCLOSURE } from "./guardrails.ts";
import { assessCaseFile, describeSelf, FACT_REQUIREMENTS } from "./interview.ts";
import { CaseFileSchema } from "./caseFile.ts";

const USAGE = `Texas family law information assistant (Spring, TX)

Usage:
  txfam                                  Start an interactive session
  txfam ask "<question>"                 Ask one question and exit
  txfam support <netResources> <kids> [otherKids]
  txfam schedule <from> <to> <miles>     Standard possession calendar
  txfam deadlines <event> <date>         Deadlines from a case event
  txfam venue <zip>                      County, courts, and clerk for a ZIP
  txfam intake [matterType]              The questions it will ask you, in order
  txfam whoami                           What it is, where its knowledge comes from
  txfam scope                            Print what this tool is and is not

Events: petition_filed, served_with_citation, answer_filed, final_decree_signed,
        temporary_restraining_order_signed, ex_parte_protective_order_signed, trial_setting

Environment:
  TXFAM_MODEL, TXFAM_MAX_TOKENS, TXFAM_EFFORT, TXFAM_MAX_ITERATIONS, TXFAM_SHOW_THINKING
`;

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireArg(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined) die(`Missing argument: ${name}\n\n${USAGE}`);
  return value;
}

function requireNumber(args: readonly string[], index: number, name: string): number {
  const raw = requireArg(args, index, name);
  const value = Number(raw);
  if (!Number.isFinite(value)) die(`${name} must be a number, got ${JSON.stringify(raw)}.`);
  return value;
}

function cmdSupport(args: readonly string[]): void {
  const result = calculateGuidelineChildSupport({
    monthlyNetResourcesUsd: requireNumber(args, 0, "netResources"),
    childrenBeforeCourt: requireNumber(args, 1, "kids"),
    asOf: parseIsoDate(today()),
    ...(args[2] === undefined ? {} : { otherChildrenSupported: Number(args[2]) }),
  });
  stdout.write(
    `Guideline child support: $${result.monthlyGuidelineSupportUsd.toFixed(2)} per month\n` +
      `  Percentage applied: ${result.appliedPercentage}% (${result.scheduleUsed} schedule)\n` +
      `  Net resources used: $${result.cappedNetResourcesUsd.toFixed(2)}` +
      `${result.capApplied ? " (capped)" : ""}\n` +
      `  Authority: ${result.statutoryBasis.join(", ")}\n\n` +
      result.caveats.map((c) => `  - ${c}`).join("\n") +
      "\n",
  );
}

function cmdSchedule(args: readonly string[]): void {
  const schedule = generatePossessionSchedule(
    parseIsoDate(requireArg(args, 0, "from")),
    parseIsoDate(requireArg(args, 1, "to")),
    { distanceMiles: requireNumber(args, 2, "miles") },
  );
  stdout.write(`${schedule.scheduleType} possession order\n\n`);
  for (const period of schedule.periods) {
    const flag = period.schoolDependent ? " *" : "";
    stdout.write(
      `  ${period.start} ${period.startTime} -> ${period.end} ${period.endTime}  ` +
        `${period.label} (${period.parent})${flag}\n`,
    );
  }
  stdout.write(`\n  * date depends on the school calendar\n\n`);
  stdout.write(schedule.caveats.map((c) => `  - ${c}`).join("\n") + "\n");
}

function cmdDeadlines(args: readonly string[]): void {
  const event = requireArg(args, 0, "event") as TriggerEvent;
  const result = computeDeadlines({
    event,
    eventDate: parseIsoDate(requireArg(args, 1, "date")),
  });
  stdout.write(`Deadlines from ${event} on ${formatLong(result.eventDate)}\n\n`);
  for (const deadline of result.deadlines) {
    stdout.write(`  ${formatDeadline(deadline)}\n      ${deadline.description}\n`);
  }
  stdout.write("\n" + result.caveats.map((c) => `  - ${c}`).join("\n") + "\n");
}

function cmdVenue(args: readonly string[]): void {
  const answer = venueForZip(requireArg(args, 0, "zip"));
  stdout.write(`County: ${answer.county}\n${answer.zipNote}\n\n${answer.residencyRule}\n\n`);
  for (const court of answer.courts) {
    stdout.write(`  ${court.name}\n    ${court.address}\n    ${court.verifyUrl}\n`);
    if (court.note !== undefined) stdout.write(`    ${court.note}\n`);
    stdout.write("\n");
  }
  stdout.write(`Records last reviewed ${answer.verifiedAsOf}.\n`);
  stdout.write(answer.caveats.map((c) => `  - ${c}`).join("\n") + "\n");
}

function cmdIntake(args: readonly string[]): void {
  const raw = args[0];
  const matterType =
    raw === undefined ? undefined : CaseFileSchema.shape.matterType.unwrap().parse(raw);
  const assessment = assessCaseFile(
    CaseFileSchema.parse(matterType === undefined ? {} : { matterType }),
  );

  stdout.write(
    `Questions it will ask${matterType === undefined ? "" : ` for a ${matterType} matter`}, ` +
      `in order:\n\n`,
  );
  for (const [index, question] of assessment.openQuestions.entries()) {
    stdout.write(`  ${index + 1}. ${question.question}\n      why: ${question.why}\n\n`);
  }
  stdout.write(`Of ${FACT_REQUIREMENTS.length} facts it tracks, ${assessment.openQuestions.length} apply here.\n\n`);
  stdout.write("Blocked until answered:\n");
  for (const capability of assessment.blocked) {
    stdout.write(`  ${capability.label}\n      needs: ${capability.missing.join(", ")}\n`);
  }
}

function cmdWhoami(): void {
  const self = describeSelf();
  stdout.write(`${self.identity}\n\nWhat it can do:\n`);
  for (const capability of self.capabilities) stdout.write(`  - ${capability}\n`);
  stdout.write("\nWhere its knowledge comes from:\n");
  for (const source of self.knowledgeSources) {
    stdout.write(`  ${source.source}\n      ${source.scope}\n`);
  }
  stdout.write("\nKnown limits:\n");
  for (const limit of self.knownLimits) stdout.write(`  - ${limit}\n`);
  stdout.write("\nWill not do:\n");
  for (const item of self.willNotDo) stdout.write(`  - ${item}\n`);
}

function writeStatus(agent: FamilyLawAgent): void {
  const assessment = agent.assess();
  stdout.write(`Case file ${Math.round(assessment.completeness * 100)}% complete.\n\n`);

  stdout.write("Known:\n");
  const entries = Object.entries(assessment.known);
  if (entries.length === 0) stdout.write("  (nothing yet)\n");
  for (const [key, value] of entries) stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);

  stdout.write("\nReady now:\n");
  if (assessment.ready.length === 0) stdout.write("  (nothing yet)\n");
  for (const capability of assessment.ready) stdout.write(`  - ${capability.label}\n`);

  stdout.write("\nBlocked:\n");
  for (const capability of assessment.blocked) {
    stdout.write(`  - ${capability.label}\n      needs: ${capability.missing.join(", ")}\n`);
  }

  if (assessment.suggestedNextQuestion !== undefined) {
    stdout.write(`\nIt will ask next: ${assessment.suggestedNextQuestion}\n`);
  }
  stdout.write("\n");
}

async function runTurn(agent: FamilyLawAgent, question: string): Promise<void> {
  const showThinking = agent.config.showThinking;
  await agent.send(question, {
    onText: (delta) => stdout.write(delta),
    ...(showThinking ? { onThinking: (delta: string) => stdout.write(`\u001b[2m${delta}\u001b[0m`) } : {}),
    onToolUse: (name) => stdout.write(`\u001b[2m[${name}]\u001b[0m `),
    onSafetyScreen: () => stdout.write("\u001b[33m[safety resources included below]\u001b[0m\n"),
  });
  stdout.write("\n");
}

async function cmdAsk(question: string): Promise<void> {
  assertCredentialsPresent();
  const agent = new FamilyLawAgent();
  await runTurn(agent, question);
}

async function cmdInteractive(): Promise<void> {
  assertCredentialsPresent();
  const agent = new FamilyLawAgent();
  const rl = createInterface({ input: stdin, output: stdout });

  stdout.write(
    `${SCOPE_DISCLOSURE}\n\nCommands: /status, /facts, /whoami, /reset, /scope, /quit\n\n`,
  );

  try {
    // The agent opens the interview rather than waiting to be asked.
    try {
      await agent.open({
        onText: (delta) => stdout.write(delta),
        onToolUse: (name) => stdout.write(`\u001b[2m[${name}]\u001b[0m `),
      });
      stdout.write("\n\n");
    } catch (error) {
      if (error instanceof AgentError) {
        stdout.write(`\u001b[31m${error.message}\u001b[0m\n\n`);
      } else {
        throw error;
      }
    }

    for (;;) {
      const line = (await rl.question("> ")).trim();
      if (line.length === 0) continue;

      if (line === "/quit" || line === "/exit") break;
      if (line === "/scope") {
        stdout.write(`${SCOPE_DISCLOSURE}\n\n`);
        continue;
      }
      if (line === "/status") {
        writeStatus(agent);
        continue;
      }
      if (line === "/whoami") {
        cmdWhoami();
        stdout.write("\n");
        continue;
      }
      if (line === "/facts") {
        stdout.write(`${JSON.stringify(agent.caseFile, null, 2)}\n\n`);
        continue;
      }
      if (line === "/reset") {
        agent.resetTranscript();
        stdout.write("Transcript cleared. Case facts kept; start a new process to clear those.\n\n");
        continue;
      }

      try {
        await runTurn(agent, line);
      } catch (error) {
        if (error instanceof AgentError) {
          stdout.write(`\n\u001b[31m${error.message}\u001b[0m\n\n`);
        } else {
          throw error;
        }
      }
      stdout.write("\n");
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  // Piping into `head` closes stdout early; that is normal use, not a crash.
  stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });

  const [command, ...args] = process.argv.slice(2);

  try {
    loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) die(error.message);
    throw error;
  }

  switch (command) {
    case undefined:
      await cmdInteractive();
      return;
    case "ask":
      await cmdAsk(requireArg(args, 0, "question"));
      return;
    case "support":
      cmdSupport(args);
      return;
    case "schedule":
      cmdSchedule(args);
      return;
    case "deadlines":
      cmdDeadlines(args);
      return;
    case "venue":
      cmdVenue(args);
      return;
    case "intake":
      cmdIntake(args);
      return;
    case "whoami":
      cmdWhoami();
      return;
    case "scope":
      stdout.write(`${SCOPE_DISCLOSURE}\n`);
      return;
    case "help":
    case "--help":
    case "-h":
      stdout.write(USAGE);
      return;
    default:
      die(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

await main().catch((error: unknown) => {
  if (error instanceof AgentError || error instanceof ConfigError) die(error.message);
  die(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
});
