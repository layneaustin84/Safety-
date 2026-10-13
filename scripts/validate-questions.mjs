#!/usr/bin/env node
/**
 * Validates the CSP Drill app before deploy. Exits non-zero on any error.
 *
 *   node scripts/validate-questions.mjs
 *
 * Checks: question schema and uniqueness, release metadata, service-worker version
 * parity, precache file existence, and that every inline script in index.html parses.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "csp-drill");
const DOMAIN_PREFIX = { math: "m", mgmt: "g", risk: "r", ergo: "e", fire: "f", erm: "x", ih: "h", env: "v", train: "t" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const errors = [];
const fail = msg => errors.push(msg);
const read = rel => readFileSync(join(ROOT, rel), "utf8");
const isNonEmptyString = v => typeof v === "string" && v.trim().length > 0;

/** Executes questions.js in an isolated context and returns window.CSP_DATA. */
function loadData() {
  const sandbox = { window: {} };
  vm.runInNewContext(read("questions.js"), sandbox, { filename: "questions.js", timeout: 1000 });
  return sandbox.window.CSP_DATA;
}

let data;
try {
  data = loadData();
} catch (err) {
  console.error(`questions.js failed to execute: ${err.message}`);
  process.exit(1);
}

if (!data || typeof data !== "object") {
  console.error("questions.js must assign an object to window.CSP_DATA");
  process.exit(1);
}

// Release metadata
if (!SEMVER.test(String(data.version))) fail(`version "${data.version}" is not semver (x.y.z)`);
if (!ISO_DATE.test(String(data.updated)) || Number.isNaN(Date.parse(data.updated))) fail(`updated "${data.updated}" is not a valid YYYY-MM-DD date`);
if (!Array.isArray(data.changes) || !data.changes.every(isNonEmptyString)) fail("changes must be an array of non-empty strings");
if (!Array.isArray(data.questions) || data.questions.length === 0) {
  console.error("questions must be a non-empty array");
  process.exit(1);
}

// Questions
const ids = new Set();
const stems = new Map();
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

data.questions.forEach((q, i) => {
  const where = `question #${i + 1}${q && q.id ? ` (${q.id})` : ""}`;
  if (!q || typeof q !== "object") return fail(`${where}: not an object`);

  const allowed = new Set(["id", "d", "q", "o", "a", "e", "added"]);
  for (const key of Object.keys(q)) if (!allowed.has(key)) fail(`${where}: unknown field "${key}"`);

  if (!isNonEmptyString(q.id)) fail(`${where}: missing id`);
  else if (ids.has(q.id)) fail(`${where}: duplicate id`);
  else ids.add(q.id);

  const prefix = DOMAIN_PREFIX[q.d];
  if (!prefix) fail(`${where}: unknown domain "${q.d}"`);
  else if (isNonEmptyString(q.id) && !new RegExp(`^${prefix}\\d+$`).test(q.id)) fail(`${where}: id must be "${prefix}" followed by digits for domain ${q.d}`);

  if (!isNonEmptyString(q.q)) fail(`${where}: empty stem`);
  else {
    const key = normalize(q.q);
    if (stems.has(key)) fail(`${where}: duplicate stem of ${stems.get(key)}`);
    else stems.set(key, q.id);
  }

  if (!Array.isArray(q.o) || q.o.length !== 4) fail(`${where}: must have exactly 4 options`);
  else {
    if (!q.o.every(isNonEmptyString)) fail(`${where}: options must be non-empty strings`);
    if (new Set(q.o.map(o => normalize(String(o)))).size !== 4) fail(`${where}: options must be distinct`);
  }

  if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) fail(`${where}: answer index a must be 0-3`);
  if (!isNonEmptyString(q.e) || q.e.trim().length < 20) fail(`${where}: explanation missing or too short`);

  if (q.added !== undefined) {
    if (!ISO_DATE.test(String(q.added))) fail(`${where}: added must be YYYY-MM-DD`);
    else if (ISO_DATE.test(String(data.updated)) && q.added > data.updated) fail(`${where}: added ${q.added} is after release date ${data.updated}`);
  }
});

// Every domain should stay represented.
for (const d of Object.keys(DOMAIN_PREFIX)) {
  if (!data.questions.some(q => q && q.d === d)) fail(`domain ${d} has no questions`);
}

// Service worker version parity and precache files.
const sw = read("sw.js");
const swVersion = sw.match(/const VERSION = "([^"]+)";/)?.[1];
if (swVersion !== data.version) fail(`sw.js VERSION "${swVersion}" must equal questions.js version "${data.version}"`);
const precache = [...(sw.match(/const PRECACHE = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(m => m[1]);
if (precache.length === 0) fail("sw.js PRECACHE list not found");
for (const p of precache) {
  if (p === "./") continue;
  if (!existsSync(join(ROOT, p))) fail(`sw.js precaches missing file ${p}`);
}

// Inline scripts in index.html must parse.
const html = read("index.html");
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  try { new vm.Script(m[1], { filename: `index.html inline script ${i + 1}` }); }
  catch (err) { fail(`index.html inline script ${i + 1} does not parse: ${err.message}`); }
});
for (const rel of ["questions.js", "sw.js"]) {
  try { new vm.Script(read(rel), { filename: rel }); }
  catch (err) { fail(`${rel} does not parse: ${err.message}`); }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map(e => `  - ${e}`).join("\n"));
  process.exit(1);
}

const perDomain = Object.keys(DOMAIN_PREFIX).map(d => `${d} ${data.questions.filter(q => q.d === d).length}`).join(", ");
console.log(`✓ CSP Drill v${data.version} (${data.updated}): ${data.questions.length} questions — ${perDomain}`);
