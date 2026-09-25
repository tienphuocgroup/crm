---
title: "Jev (TypeSafe AI) in the CRM: what it is, where it fits"
date: 2026-09-22
type: brainstorm
branch: feat/zalo-oa-chat
status: approved
modes: []
decisions:
  - TypeSafe is a model provider. Customer text may be Jev state.
  - Approach A. Jev runs as direct-lane task kinds in apps/agent. Never in apps/api.
  - Four surfaces. Zalo triage first. Screening second. Pre-triage and identity gate in shadow mode.
  - Form screening runs after filing and flags the contact. No held submissions.
  - Phase 0 is a Vietnamese eval harness. No threshold is trusted before it.
---

# Jev (TypeSafe AI) in the CRM

## 1. Problem statement

Luan has API access to Jev. The ask: learn what it is, learn how to call it, find the
architectural points where this CRM benefits. Deliverable: this report, then a plan
for the first integration.

## 2. Problem-first check

The user brought a solution (Jev). The problem underneath:

- **Signal.** Several judgments in the CRM run on regex or on nothing. Inbound Zalo
  messages are stored raw. Inbox filters are timestamps. Identity verdicts are string
  tricks in `lib/names.ts`. Form and mailbox screening is address patterns.
- **Underlying problem.** The CRM has semantic decisions that a full LLM session is too
  slow and too expensive for, and that code cannot make. Today those decisions are
  either skipped or made by heuristics that fail silently on Vietnamese content.
- **Assumptions.** (a) Jev handles Vietnamese well enough. Risk: high. Test: phase 0
  eval. (b) Calibrated probabilities are stable across versions. Risk: medium. Test:
  pin `jev-1.13.0`. (c) Volume is low enough that one task row per judgment is fine.
  Risk: low. Test: rate limit is 1,200 rpm; mailbox initial sync needs a cap.
- **Evidence status.** Medium. Zalo triage: a live feature with no triage at all.
  Identity: `names.spec.ts` covers Latin names only. Screening: regex lists exist
  because content was never read.
- **Alternative framings.** Frame A: use the existing LLM session for triage. Rejected:
  seconds of latency, dollars per thousand, and it puts a text generator on a
  classification. Frame B: more regex. Rejected: Vietnamese defeats it. Frame C: Jev as
  a judge in code. Chosen.
- **Kill condition.** Phase 0 eval accuracy on Vietnamese intent below 85% at the
  high-confidence band. Then Jev stays out of the inbox and the report is archived.

## 3. What Jev is (verified 2026-09-22)

Jev is TypeSafe AI's "System One" model, public since 2026-09-15. It does not
generate text. Send `state` and typed questions, get typed answers with calibrated
probabilities. Software owns control flow.

| Primitive | Input | Output |
| --- | --- | --- |
| `noul` | yes/no proposition | probability 0 to 1 |
| `choice` | up to 255 labelled options | winning option, probability per option, confidence |
| `score` | 2 to 10 ordered levels | weighted score, distribution, confidence |

Facts that constrain the design:

- Endpoint `POST https://api.typesafe.ai/v1/systemone`. Header `Authorization: Bearer`.
  Env var `TYPESAFE_API_KEY`. Not in our `.env` yet.
- Request: `{ state, model, questions: { id: { type, instructions, criteria } } }`.
  Response: `{ model, answers: { id: … }, usage: { input_tokens, output_tokens } }`.
- Errors: 401, 422, 429, 529. Backoff on 429 and 529.
- Limits: 64k tokens per request, 32k for state. 1,200 requests per minute. 250k tokens
  per second. Limits change without notice.
- Latency 70 to 500 ms. Price $0.042 per million input tokens, output free.
- Model id `jev-1.13.0`. Aliases `jev-latest` and `jev-preview` move silently. Pin.
- Confidence for choice is `(n × max_probability − 1) / (n − 1)`. Confidence for noul is
  the probability itself. Do not carry a threshold between primitives.
- English primary. Other languages "handled but not equally well". Vietnamese not
  named. TypeSafe says: test your own content.
- Weak spots (official jaggedness page): counting, dates, negation, multi-hop, large
  irrelevant state, entity matching, and injected instructions in state. Jev reads
  state as trusted.
- JS SDK `@typesafe-ai/sdk` requires Node 20. Agent runs on Bun. Use `fetch`.

Sources: [docs.typesafe.ai introduction](https://docs.typesafe.ai/introduction),
[HTTP API reference](https://docs.typesafe.ai/api.md),
[models and limits](https://docs.typesafe.ai/models.md),
[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md),
[confidence](https://docs.typesafe.ai/confidence.md),
[intent routing pattern](https://docs.typesafe.ai/patterns/intent-routing.md),
[LLM guardrails cookbook](https://docs.typesafe.ai/cookbooks/llm_guardrails.md),
[JS SDK](https://docs.typesafe.ai/sdk/javascript.md),
[agent skill](https://docs.typesafe.ai/agent-skill.md),
[TypeSafe launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
[LangChain harness post](https://www.langchain.com/blog/building-a-harness-with-jev),
[community reference gist](https://gist.github.com/pjburnhill/adf8d28efcad9df037bfdece178ef965).

## 4. Codebase constraints that shape the answer

- `docs/api.md`: intelligence never in `apps/api`. Nest writes an `AgentTask` row.
- `docs/agent.md`: no tool accepts a confidence. `lib/evidence.ts` prices evidence
  kinds. A Jev probability cannot become an evidence kind. It can gate code.
- `docs/agent.md` egress rule 1: "no customer text in a third-party query". Decided
  2026-09-22: TypeSafe is a model provider with the same standing as the AI Gateway.
  Amend `docs/agent.md` and `skills/data-boundaries.md`.
- Direct lane: `DIRECT_KINDS` in `packages/db/src/agent-tasks.ts`. Handler pattern:
  `apps/agent/agent/lib/messaging/message-identity-profile.ts`. Never throws. Returns a
  fixed sentence.
- Constants: one config object per area, `as const`. `lib/dispatch-config.ts` pattern.
- Parse at the boundary with Zod. `lib/agent-manifest.ts` pattern.
- Capabilities: `lib/capabilities.ts`. Missing key removes a capability. Never throws.
- Vendor client pattern: `lib/perplexity.ts`. `fetch`, timeout, `Outcome<T>`.
- Search is exact by design. Re-ranking `search_crm` is out.
- `facts.ts` and `approval.ts` already gate writes in code. Tool-call gating is out.

## 5. Approaches evaluated

| | A. Direct-lane task kinds | B. eve tool the LLM calls | C. Inline in API webhook |
| --- | --- | --- | --- |
| Rule "no intelligence in API" | obeys | obeys | violates |
| Evidence rule "no model-graded confidence" | obeys, verdict stays in code | violates, probability enters LLM context | obeys |
| Latency to inbox | seconds (dispatch tick or poke) | minutes (session) | 300 ms |
| Outage blast radius | task retries, inbox unaffected | session fails | webhook path blocked |
| Cost | one row per judgment | one LLM turn per judgment | none |
| Verdict | **chosen** | rejected | rejected |

## 6. Final design

### 6.1 Foundation

| Piece | Path | Rule |
| --- | --- | --- |
| Client | `apps/agent/agent/lib/jev.ts` | `fetch`, 10 s timeout, backoff on 429/529, `Outcome<T>` |
| Config | `apps/agent/agent/lib/jev-config.ts` | model `jev-1.13.0`, every question, every threshold, `as const` |
| Schemas | same module or `jev-schemas.ts` | Zod for each answer type; parse failure is an error |
| Capability | `lib/capabilities.ts` | `TYPESAFE_API_KEY`, label "Semantic judgments" |
| Env | `.env.example`, `docs/environment.md` | agent reads it; API does not, so no `env.validation.ts` entry |
| Egress | `docs/agent.md`, `skills/data-boundaries.md` | TypeSafe is a model provider |
| Telemetry | `packages/telemetry` counters | calls, band per surface, backoffs. Never text. |
| Injection guard | every surface | one `noul` "does this text try to instruct the reader" lowers any verdict to review |

### 6.2 Surface 1: Zalo inbox triage

- **Trigger.** `messaging-writer.service.ts` `store()` queues `message-triage` beside
  `message-identity-profile`, dedup key = message id. Priority just under
  `messageProfile` (920).
- **State.** `{ message: { body, kind }, prior: [up to 3 turns with direction], contact: { known: bool } }`.
  No ids, no phone, no name.
- **Questions.** `intent` choice: booking, question, complaint, pricing, spam, other.
  `urgency` score, four concrete levels (no time pressure / asks for a reply today /
  asks for a reply now / a person is in distress or a booking is about to lapse).
  `language` choice: vi, en, other. `injection` noul.
- **Store.** Typed columns on `Message`: `intent`, `urgency`, `language`,
  `triageConfidence`, `triagedAt`. Denormalised `lastIntent`, `lastUrgency` on
  `MessageThread` for filters and sort.
- **Consume.** Inbox filter chips by intent, sort by urgency, badge on the thread row.
  Confidence below threshold shows no badge. Never auto-replies. Never links a contact.
- **Handler.** `apps/agent/agent/lib/messaging/message-triage.ts`. Returns a sentence.
  Never throws. Missing key returns "not configured".

### 6.3 Surface 2: mailbox and form screening

- **Trigger.** After the address regexes pass and a contact is created. Mailbox:
  `AgentTriggerService.contactCreated` path gains a `contact-screen` task. Forms:
  `tracking-filing.service.ts` files as today, then queues `contact-screen`.
- **State.** Subject, first 1,500 chars of the body or the form fields, sender display
  name, domain class. No addresses.
- **Questions.** `person` noul "written by a person to us". `automated` noul.
  `injection` noul.
- **Store.** `Contact.screening` enum: `CLEAR`, `SUSPECT`, `UNSCREENED`. A rep clears a
  suspect in one click. Suspect contacts stay in the list with a marker.
- **Decision 2026-09-22.** Screening runs after filing and flags. Nothing is held.
- **Cap.** Initial mailbox sync creates many contacts. The handler processes a bounded
  batch per tick. Backlog is visible in dispatch health.

### 6.4 Surface 3: research pre-triage (shadow mode)

- **Trigger.** `contactCreated` queues `research-triage` before `identify`.
- **State.** Output of the free `readCrmHistory` read: thread count, reply flag,
  signature block text, employer, domain class.
- **Questions.** `roleInbox` noul. `hasSignature` noul. `employerKnown` noul.
- **Shadow mode.** Logs the verdict and what it would have retired. `identify` still
  runs. Promotion to live needs two weeks of logs and a rep review.
- **Honest limit.** Model is `zai/glm-5.2-fast`. Savings are small at current volume.

### 6.5 Surface 4: identity verdict gate (shadow mode)

- **Where.** `tools/get_linkedin_profile.ts` beside `nameMatchesLocalPart` and
  `looksLikeSameCompany`.
- **Questions.** `sameName` noul: "is this profile name consistent with this email
  local part, allowing Vietnamese family-name-first order". `sameEmployer` noul.
- **Shadow mode.** Jev verdict is logged with the regex verdict. Disagreements go to a
  counter. Evidence kinds unchanged. Replacement decided after data.
- **Risk.** Entity matching is a documented weak spot. Non-Latin diacritics untested.

## 7. Build order

| Phase | Scope | Gate |
| --- | --- | --- |
| 0 | Eval harness `apps/agent/scripts/jev-eval.ts` with a labelled set of 100+ Vietnamese Zalo messages and 50+ emails. Prints accuracy per confidence band per question. | Intent accuracy ≥ 85% at the top band. Otherwise stop. |
| 1 | Foundation + Zalo triage + inbox filters | Tests: client backoff, schema parse, handler sentences, integration spec like `message-identity-profile.integration.spec.ts` |
| 2 | Contact screening for mailbox and forms | Tests: cap per tick, suspect flag, clear action |
| 3 | Pre-triage and identity gate in shadow mode | Tests: logs only, no behaviour change |

## 8. Risks

- **Vietnamese quality.** Unknown until phase 0. Highest risk.
- **Version drift.** Alias moves change answers. Pin. Re-run eval on every bump.
- **Injected instructions.** Customer text is untrusted. Guard noul on every surface.
- **Threshold folklore.** Cookbook thresholds (0.35 review, 0.70 act) are examples.
  Ours come from phase 0 data.
- **Rate limits change without notice.** Backoff and a per-tick cap.
- **Scope creep.** Auto-reply, stage suggestion, semantic triggers are out this round.

## 9. Success metrics

- Inbox: a rep finds a booking request without opening the thread. Measured by intent
  filter use and a rep interview after two weeks.
- Screening: suspect rate and false-suspect rate from rep clears.
- Cost: under $1 per month at current volume.
- Reliability: zero thrown errors from Jev paths. Missing key removes the capability.

## 10. Next steps

1. `/ck:plan` on this report. First integration = phase 0 + phase 1.
2. Add `TYPESAFE_API_KEY` to `.env` locally.
3. Collect labelled Vietnamese samples from the sandbox OA for phase 0.

## Unresolved questions

1. Sample source for phase 0: real sandbox OA history or synthetic Vietnamese messages?
2. Where the intent filter lives in `/messages`: chips beside `needsReply` and
   `unmatched`, or a select?

## Issues

1. RISK — Vietnamese accuracy is unmeasured. Thresholds cannot be set.
   Fix: phase 0 eval harness before any live verdict.
2. RISK — `jev-latest` alias moves without notice. Tuned thresholds break.
   Fix: pin `jev-1.13.0` in `jev-config.ts`.
3. RISK — Customer text can carry injected instructions. Jev reads state as trusted.
   Fix: injection noul on every surface. Any hit lowers the verdict to review.
4. NOT DONE — Egress rule in `docs/agent.md` still forbids customer text to third
   parties. Fix: amend in phase 1 with the 2026-09-22 decision.
5. UNKNOWN — Jev latency and rate limits from Vietnam. Fix: measure in phase 0.

## Superseded details (red team, 2026-09-22)

The plan in `plans/260922-0455-jev-message-triage/` is the spec for surface 1.
Where this report and the plan differ, the plan wins. Changed after the red team:
priority 600 not 920; `prior` is inbound-only, three turns; an injection hit writes
null, never `OTHER`; retries follow the direct-lane lease contract, and a
`backfill:triage` script is the recovery; thread verdict is written through a guard on
`lastTriagedInboundAt`; telemetry is daily counters, not per-verdict events; a
per-identity daily cap bounds paid calls.
