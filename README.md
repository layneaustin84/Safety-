# Texas Family Law Agent (Spring, TX)

An AI assistant that explains the Texas family court system to self-represented
people in and around Spring, Texas. It answers with the statute, computes the
numbers and dates itself instead of guessing them, and knows where the
Harris/Montgomery county line runs.

**This is not a lawyer.** It produces legal information, not legal advice. It
creates no attorney-client relationship, holds no privilege, files nothing, and
signs nothing. Court rules, dollar caps, and court assignments change; every
answer names what has to be verified against the official source.

## What it does

| Capability | Backed by |
|---|---|
| Guideline child support, including the cap, the low-income schedule, and the multiple-household table | Tex. Fam. Code ch. 154 |
| Standard Possession Order calendars: weekends, Thursdays, alternating holidays, summer, expanded election, and the beyond-100-mile schedule | Tex. Fam. Code §§ 153.3101–153.317 |
| Deadlines from a case event: answer date, the 60-day divorce wait, disclosures, post-judgment and appellate deadlines, TRO and protective order settings | Tex. R. Civ. P. 4, 99(b), 194, 329b; Tex. Fam. Code §§ 6.702, 83.002 |
| Venue: ZIP to county, courts, district clerk, residency requirements | Tex. Fam. Code §§ 6.301, 103.001 |
| Curated Family Code search with citations | 24 hand-checked provisions |
| Pro se form packets and legal aid, lawyer referral, child support, and domestic violence resources | TexasLawHelp, Lone Star Legal Aid, OAG |
| Safety screening for family violence, child abuse, abduction risk, and self-harm | Injected as an operator directive before the model answers |
| Two-way interview: it asks you questions, tracks what it still needs, and answers questions about itself | `src/interview.ts` |
| Geographic restrictions and relocation, without assuming what your order says | Tex. Fam. Code § 153.134(b)(1); Lenz v. Lenz |

## Install and run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`

npm start                              # interactive session
npm start -- ask "how do I modify child support in Harris County?"
```

The calculators also run offline, with no API call and no credential:

```bash
npm start -- support 6500 2            # net resources, number of children
npm start -- schedule 2026-01-01 2026-06-30 20
npm start -- deadlines served_with_citation 2026-09-21
npm start -- venue 77389
```

Interactive commands: `/status`, `/facts`, `/whoami`, `/reset`, `/scope`, `/quit`.

The agent opens the session itself: it introduces itself, tells you that you can
question it back, and asks the first question. Two more offline commands show
that machinery without an API call:

```bash
npm start -- intake modification   # the questions it will ask, in order, and why
npm start -- whoami                # what it is, its sources, and its limits
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TXFAM_MODEL` | `claude-opus-5` | Model id |
| `TXFAM_MAX_TOKENS` | `32000` | Output cap per turn |
| `TXFAM_EFFORT` | `high` | `low` through `max` |
| `TXFAM_MAX_ITERATIONS` | `12` | Tool-calling iterations per turn |
| `TXFAM_SHOW_THINKING` | `false` | Stream summarized reasoning |

## Library use

```typescript
import { FamilyLawAgent } from "tx-family-law-agent";

const agent = new FamilyLawAgent();
const result = await agent.send("My ex lives 300 miles away. What is our summer schedule?", {
  onText: (delta) => process.stdout.write(delta),
});
console.log(result.toolsCalled, result.caseFile);
```

The pure calculators are exported too, so they can be used without the model:
`calculateGuidelineChildSupport`, `generatePossessionSchedule`,
`computeDeadlines`, `venueForZip`, `searchStatutes`, `screenForRisk`.

## The two-way interview

The agent is not a search box waiting for a query. It runs a structured intake
and hands the turn back.

**It knows what it does not know.** `src/interview.ts` holds one table of facts
and one table of capabilities. From those it derives what is missing, what each
missing fact is blocking, and what to ask next. A session progresses like this:

```
session start                    0%   ready: nothing
                                      asks: is anyone in danger right now?
"I want to change my order"     17%   ready: forms_and_referrals
                                      asks: what is your ZIP code?
"77386, order exists, two kids" 42%   ready: venue, forms_and_referrals
                                      asks: what are the paying parent's monthly net resources?
"$5,200, 8 miles, April 2022"   67%   ready: everything
                                      asks: any other children he supports?
```

Question order is deliberate. Safety comes before what the user is trying to do,
which comes before where they live, which comes before any arithmetic. Questions
that do not apply are dropped: a modification matter is never asked the six-month
residency question, and a divorce is never asked when the prior order was signed.

**It knows what it is.** Ask what it is, where a number came from, how current
its data is, or whether it can be trusted on a point, and it answers from
`describeSelf()` rather than improvising. That includes the uncomfortable parts:
no memory between sessions, no access to your actual case or the court's docket,
an unverified support cap, and a list of things it will not do. It is
introspective about its own state, not conscious, and the prompt forbids it from
claiming feelings or a stake in your outcome.

## Three correctness properties

**Possession periods never conflict.** Holiday and extended summer possession are
exceptions to the ordinary schedule, not parallel schedules beside it. Each
period carries a precedence tier, and a resolution pass removes or trims the
lower tier. A weekend falling inside a summer block is not a second possession
period; it does not happen, because the parent already has the child. What was
removed is reported in `superseded`, never dropped silently. A test asserts that
no two periods overlap across a full generated year.

**Reference data governs capability readiness, and verification is separate from
freshness.** Any value resting on an outside publication carries a `Provenance`
record with `id`, `verificationStatus`, `effectiveDate`, `source`, `sourceUrl`,
`lastChecked`, and a per-source `maxAgeDays` policy. Readiness is derived, never
stored:

| Source state | Capability state | Concern |
|---|---|---|
| unverified | `requires_verification` | `unverified` |
| verified, within `maxAgeDays` | `ready` | — |
| verified, beyond `maxAgeDays` | `requires_verification` | `stale` |
| required fact missing | `blocked` | — |

Keeping the two dimensions apart matters most for the court directory, which was
confirmed against the counties' own pages and still goes stale on a 90-day
interval without any statute moving. A single "is it current" flag cannot say
that. A missing fact outranks a verification concern, because "I cannot do this"
and "I can, but confirm the figure first" are different messages.

```
READY:                 possession_schedule
REQUIRES VERIFICATION: venue <- court_directory (stale)
REQUIRES VERIFICATION: child_support <- support_cap (unverified)
REQUIRES VERIFICATION: forms_and_referrals <- court_directory (stale)
BLOCKED:               case_deadlines <- petitionFiledOn, servedOn, priorOrderSignedOn
                       relocation_analysis <- geographicRestrictionExists, destination
```

`dependenciesOf` is the single place a capability's sources are declared.
Anything holding a review date in its own module belongs there rather than
carrying a date only a human ever reads.

**Order-specific language is never assumed.** Texas has no relocation statute.
Section 153.134(b)(1) lets a court fix any geographic area it likes, and the
same move is permitted under "the State of Texas" and prohibited under "Harris
County only". So the relocation analysis asks for the restriction verbatim and
refuses to reason from a typical one:

```
determination: requires_order_language
"There is a geographic restriction, so the move turns on its exact words.
 I will not guess at them."
needed: The restriction's exact wording, copied from the order
        Who the restriction binds: the primary conservator only, or both parents
```

Given the words and a destination it still stops at `requires_legal_judgment`.
It gives the Lenz factors and what must be proved; it does not rule on the move.

## Design notes

**Tools over recall.** Every computable answer goes through a pure function with
its own tests. The model's job is to gather facts, choose the tool, and explain
the result in plain language; it is not asked to remember a percentage table.

**Unverified data stays labeled.** The § 154.125 net-resources cap is a dated
table with a `verified` flag. The six-year adjustment due September 1, 2025
could not be confirmed here, so the calculator carries the prior cap forward and
returns a caveat naming the OAG as the source to check. Court records carry a
`verifiedAsOf` date and a verification URL for the same reason. Stale data is
disclosed, never laundered into a confident number.

**School-dependent dates are flagged, not faked.** Most possession boundaries
are defined as "when school is dismissed." Spring is served by three districts
with different calendars, so those dates come back marked
`schoolDependent: true` with a placeholder time.

**Two kinds of memory.** The transcript keeps final assistant turns. Durable
facts (county, income, dates, children) live in a case-file store the model
reads and writes through tools, so a long session neither re-sends every
intermediate tool payload nor forgets what the user already said.

**The safety screen speaks as the operator.** When a turn matches a violence,
abuse, abduction, or self-harm pattern, the directive is appended as a
mid-conversation system message rather than edited into the user's text. That
keeps it out of the channel a hostile input could imitate and leaves the cached
prompt prefix intact.

**Calendar math is UTC-backed.** Deadlines count whole civil days. Every date is
a `YYYY-MM-DD` value backed by UTC midnight, so a DST transition can never
shift a filing deadline by a day.

## Tests

```bash
npm test        # 35 tests, no network or credentials required
npm run typecheck
```

Covered: DST-crossing arithmetic, month-end clamping, Friday-counted weekend
ordinals, the cap and low-income and multiple-household support branches, the
Rule 99(b) "Monday next following" strictness, the Rule 4 holiday roll-forward,
holiday parity alternation, the split-ZIP venue case, search false positives,
and the safety screen.

## Limits worth knowing

- The Family Code knowledge base is 24 curated provisions, not the whole code.
  Outside that set the agent says so rather than inventing a citation.
- Net resources are an input, not a computation. The § 154.062 tax deductions
  need tax facts this package does not collect.
- Court numbers and addresses were last reviewed on the date in
  `src/data/courts.ts` and drift without notice.
- Children under three fall outside the standard possession order
  (§ 153.254); the generator flags this but does not build that schedule.
