# Healthcare terminology map — single source of truth

Applies to catalog VALUES only, in `apps/app/messages/{en,vi}/*.json`.
Keys never change. ICU argument names, `plural`/`select` structure, and tags
never change unless a row below explicitly restructures both locales together.

## Core noun map (en)

| Old | New | Scope |
| --- | --- | --- |
| deal / deals | journey / journeys | every CRM noun use |
| Deal / Deals | Journey / Journeys | |
| company / companies | organization / organizations | every CRM noun use, incl. the workspace's own ("your own organization") |
| Company / Companies | Organization / Organizations | |
| contact / contacts | client / clients | the CRM person noun ONLY — never the verb "contact/contacted" |
| Contact / Contacts | Client / Clients | |
| customer / customers | client / clients | |
| prospect / lead (sales noun) | inquiry | NOT "leads" in research-trail sense (see keep-list) |
| sales (adjective/team) | drop it or reword to care/intake | e.g. "an approved sales channel" → "an approved channel" |
| pipeline | pipeline | KEEP — neutral |

## Outcome / stage-adjacent vocabulary (en)

| Old | New | Note |
| --- | --- | --- |
| won (a deal) / win | enrolled / enroll | "Closed won" → "Enrolled" |
| win rate | conversion rate | |
| lost / lose (a deal) | lost / lose | KEEP — "lost reason" stays |
| closed (grouping: open vs closed) | closed | KEEP — open/closed journey grouping is neutral |
| close (a deal) as lost | mark as lost | "Close as lost" → "Mark as lost" |
| close date / expected close | enrollment date / expected enrollment | deal field labels |
| closing (close-date facet sense) | enrolling | "Closing this month" → "Enrolling this month" |
| unqualified | not a fit | bulk action copy; stage keys themselves are Phase 2 |
| being sold / selling to / buying | reword to program/care framing | see per-string decisions |

## Per-string decisions (en) — exact replacements

| File:key | Old value | New value |
| --- | --- | --- |
| deals.json namePlaceholder | `{company} — Comp AI` | `{company} — Longevity program` |
| deals.json createDescription | Every deal belongs to a company… | `A journey is a client's path to enrollment, with someone's name against it.` |
| deals.json descriptionPlaceholder | What {company} is buying, why now… | `What this journey is for, why now, and what stands in the way.` |
| deals.json noContactsDescription | …Bring the people you are selling to onto the deal… | `Nobody from {company} is attached yet. Bring the client onto the journey and it says who to chase.` |
| deals.json pageDescription | The pipeline, and everything that has already closed. | keep shape: `The pipeline, and every journey that has already closed.` |
| companies.json noDealsYetDescription | Nothing is being sold to {name} right now… | `No journeys with {name} right now. Open one and it joins the pipeline and the forecast.` |
| companies.json pageDescription | Every account in the pipeline. | `Every organization in the pipeline.` |
| contacts.json notOnAnyDealsDescription | …not attached to anything being sold yet. Deals are opened on the company… | `{name} has no journey yet. Start one and it appears here.` |
| contacts.json pageDescription | Everyone in the pipeline. | keep as is |
| dashboard.json closedWonSeriesLabel | Closed won | `Enrolled` |
| dashboard.json closedWonThisMonthLabel | Closed won this month | `Enrolled this month` |
| dashboard.json closedWonVsNewPipelineTitle | Closed won vs. new pipeline | `Enrolled vs. new pipeline` |
| dashboard.json winRateLabel | Win rate ({days}d) | `Conversion rate ({days}d)` |
| dashboard.json winsLossesSummary | {wins} won · {losses} lost | `{wins} enrolled · {losses} lost` (ICU args stay `wins`/`losses`) |
| settings.json slackSuggestionDealCreatedDescription | Post the deal to an approved sales channel. | `Post the journey to an approved channel.` |
| settings.json slackSuggestionDealWonTitle | When a deal is won | `When a client enrolls` |
| settings.json slackSuggestionDealWonDescription | Tell an approved channel that the deal closed. | `Tell an approved channel about the enrollment.` |
| landing.json + agent-panel.json "Hand new customers from Sales to Onboarding" | | `Hand new clients from intake to care` |
| deals.json bulkMarkUnqualifiedTitle | Mark # deal as unqualified | `{count, plural, one {Mark # journey as not a fit} other {Mark # journeys as not a fit}}` |
| deals.json markUnqualifiedDescription | Why is this not a fit? It goes on the timeline so nobody re-runs the same deal. | `Why is this not a fit? It goes on the timeline so nobody re-runs the same journey.` |

ICU argument names such as `{company}`, `{deals}`, `{wins}` are code
identifiers: they NEVER change even though the surrounding words do.

## Keep-list — real strings that must NOT change

- `ui.json` — entire file is verify-only; zero sales vocabulary.
- `common.json` `"close": "Close"` — generic dialog/sheet verb.
- `nav.json` `"closeNavigation": "Close navigation"` — verb.
- `agent-panel.json` `"closeLabel": "Close"` — panel close button.
- `agent-panel.json` `recordContactBlurb` "…including the leads it throws away." —
  "leads" is the research-trail sense, not a sales lead. Only "Contact" nouns in
  that file change.
- `landing.json` `suggestedActionNotContactedIn` "that haven't been contacted in" —
  verb.
- `settings.json` `slackReconnectNotice` "You lose nothing." — generic "lose".
- `contacts.json` `factDismissedToast` "…it won't be suggested again." — "won't"
  is a contraction, not "won".
- Every value containing "closed"/"open" as journey grouping ("already closed",
  "What you have closed", "Closed" tab labels) — keep the word "closed".
- `settings.json` `general.language*` endonyms — never touch.
- `common.json` `relativeTime*` — NEVER restructure; consumed by
  `t.raw` + literal `split("{count}")` in `apps/app/lib/local-date-time-script.ts`.
- ALL `deals.json` `stage*` keys (17 keys, `stageAllTabLabel` … `stageUpdatedToast`)
  — Phase 2 owns them; skip entirely.
- Brand names: Comp AI, Gmail, Outlook, Slack, LinkedIn, Google, Microsoft, Context.
- "pipeline" — keep everywhere.
- "lost" / "lost reason" — keep.

## Vietnamese terms (draft — native review is a Phase 4 gate)

| en | vi |
| --- | --- |
| Journey / journey | Hành trình / hành trình |
| Organization / organization | Tổ chức / tổ chức |
| Client / client | Khách hàng / khách hàng |
| enrolled / enroll | đã đăng ký / đăng ký |
| enrollment | đăng ký |
| conversion rate | tỷ lệ chuyển đổi |
| inquiry | yêu cầu tư vấn |
| pipeline | pipeline (keep as en catalogs keep it — follow existing vi usage) |
| lost | thất bại (follow existing vi usage for "lost") |
| care / intake | chăm sóc / tiếp nhận |

vi rules: mirror the en decision per key. Where existing vi already translates
"deal" (e.g. "thương vụ"), replace with "hành trình"; "công ty" → "tổ chức";
"liên hệ" (noun for the CRM person) → "khách hàng" — but "liên hệ" as a VERB
stays. Plural/ICU restructure is allowed only if en restructures in the same
change, and never for the never-restructure list.
