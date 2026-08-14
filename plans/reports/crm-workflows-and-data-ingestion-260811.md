<title>CRM Workflows & Data Ingestion Guide</title>

# CRM Workflows & Data Ingestion Guide

## System Overview

**Comp AI CRM** is an **agent-first CRM** designed for intelligent data collection and management. Unlike traditional CRMs where humans enter data, this system is built so that:
- The **agent does research and populates records** (runs on its own schedule)
- Humans use the CRM to **review, verify, and take action** on what the agent found
- The CRM is where the agent **keeps its notes** (not a bolt-on feature)

Think of it as: Sales/Support teams work with a living, intelligent record system that continuously improves itself.

---

## Three Core User Workflows

### 1. **Sales Rep Workflow** — Managing Opportunities & Customers

**Primary use case:** Track deals, manage contacts, follow up with prospects

**Typical flow:**
1. **Enter a customer/company** → Agent automatically enriches it (LinkedIn, company data, employee info)
2. **Check the Agent tab** → See what research the agent completed, questions it needs answered
3. **Answer agent questions** → "Is this the right contact?" "What's their budget?"
4. **Review suggested facts** → Accept/reject findings (job title, email, company location)
5. **Manage the deal pipeline** → Update stage (Discovery → Demo → Qualified → Contract → Won/Lost)
6. **Add notes/activity** → Log calls, emails, meetings (some synced from Gmail/Outlook automatically)
7. **Schedule follow-ups** → Agent reschedules automatically with reminders

**Key interaction points:**
- **Contacts page** — List of people to reach (with AI-suggested next steps)
- **Companies page** — Account view with company details, all contacts, deal pipeline
- **Deals page** — Pipeline view (visual stage progression)
- **Agent tab** — See the research in progress, approve findings

---

### 2. **Customer Success/Support Workflow** — Onboarding & Account Health

**Primary use case:** Track customer implementation, expansion, renewal

**Typical flow:**
1. **Company signs contract** → New account created in CRM
2. **Agent monitors** → Tracks their public messaging, company news, team changes
3. **Success team reviews** → Checks company profile, team composition, renewal dates
4. **Schedule check-ins** → Quarterly business reviews, renewal conversations
5. **Capture account history** → Notes on expansion opportunities, risks, champion changes
6. **Track metrics** → Contract value, usage, product adoption

**Key interaction points:**
- **Company profile** — Full customer context (industry, size, location, contacts, deal value)
- **Timeline** — Meetings, notes, activity history
- **Agent tab** — "This customer had a CTO transition" → identify re-qualification opportunity

---

### 3. **Research/Operations Workflow** — Data Quality & Verification

**Primary use case:** Ensure data accuracy, validate agent findings, handle disputes

**Typical flow:**
1. **Review suggestion queue** → Items the agent is unsure about (confidence < threshold)
2. **Verify facts** → Cross-check multiple sources before writing to the record
3. **Dispute findings** → "This contact is wrong" → agent learns and skips similar inference
4. **Bulk actions** → Tag industries, flag accounts, mark for follow-up
5. **Reports/analytics** → Pipeline health, win rate by segment, sales velocity

**Key interaction points:**
- **Pending suggestions** — Items waiting for human approval
- **Audit tab** — Every change: who changed it, when, from what source
- **Bulk editor** — Update many records at once

---

## Data Ingestion: Five Paths to Populate the System

### Path 1: Manual Entry (Zero Bootstrap)

**When:** Small teams starting from scratch, or testing

**How it works:**
```
Sales rep opens app → Creates company "Acme Corp" → Creates contact "John Smith"
↓
Agent immediately starts enriching:
  - Pulls LinkedIn profile if email matches
  - Searches for company website, industry, competitors
  - Checks GitHub for founder/CTO identity
  - Reads CEO's Twitter for recent news
↓
Results appear as "suggestions" on the contact/company record
↓
Rep approves: "Yes, that's correct" → fact is locked in
Or disputes: "No, wrong person" → agent learns to avoid this
```

**Effort:** High (manual one-by-one)  
**Speed:** Slow but works instantly with zero setup

---

### Path 2: CSV/Bulk Import (Requires Development Currently)

**Status:** No UI button yet; requires backend work or database-level import

**How to implement:**
There are two approaches:

**Option A: Write custom import script** (recommended for one-time migration)
1. **Export from old system** as CSV with columns:
   - Company: `name`, `domain`, `industry`, `country`
   - Contact: `first_name`, `last_name`, `email`, `phone`, `company_id`, `title`
   - Deal: `company_id`, `contact_id`, `amount`, `stage`, `close_date`, `description`

2. **Use tRPC API** to create records:
   ```typescript
   // Pseudocode using tRPC client
   const rows = await readCSV('contacts.csv')
   for (const row of rows) {
     const company = await trpc.companies.create({
       name: row.company_name,
       domain: row.company_domain,
       industry: row.industry,
     })
     // ... etc
   }
   ```

3. **Run the import** on a fresh database or staging environment

**Option B: Direct database import** (fastest for large datasets)
- Use Postgres `COPY` or `INSERT` commands directly
- Requires someone comfortable with SQL and Postgres
- Can handle 10k+ records in minutes
- Must ensure foreign key constraints are satisfied

4. **After import:** Agent immediately starts enriching all records (runs background research)

5. **Review agent findings** over next 24–48 hours as they appear

**Effort:** Moderate (one-time developer effort or SQL knowledge)  
**Speed:** Fast—thousands of records in minutes once imported

**Data quality after import:**
- Names, emails, basic structure → preserved as-is
- Job titles, company details → agent verifies/upgrades
- Missing fields (phone, LinkedIn) → agent fills in if it finds them
- Duplicate detection → manual review required (agent suggests merges)

**Note for self-hosters:** CSV import UI is on the roadmap. Until then, Option A (tRPC script) or Option B (direct Postgres) are the workarounds.

---

### Path 3: Email/Calendar Sync (Continuous Live Feed)

**When:** Already communicating with customers; want to auto-populate touchpoints

**How it works:**
1. **Rep signs in with Google/Microsoft account** → CRM asks permission to read Gmail/Outlook
2. **Mailbox sync runs** (once daily, or on schedule):
   - Scans `From:` addresses → creates/links contacts automatically
   - Reads meeting subjects/attendees → creates activity records
   - Extracts signature blocks → validates job titles
3. **Threads appear in CRM** as "activity" on the contact/company record
4. **Calendar events logged** as meetings

**One-time setup:**
- Enable Gmail API / Microsoft Graph in your OAuth client
- Set `CRON_SECRET` and point a scheduler to `POST /internal/sync/mailboxes`

**Benefit:**
- Zero data entry: reps send emails, the CRM captures them
- History preserved: old threads pulled on first sync (from "now" forward)
- Signature block mining: agent extracts phone, title, reporting line

**No data ever leaves email:** The CRM reads only, never sends/moves/deletes

---

### Path 4: API/Webhook Integration (Custom Development Required)

**Status:** No built-in webhook receiver; requires custom development

**Feasibility:** Possible but requires backend engineering

Webhook support would allow:
- Stripe/Paddle subscriptions → Auto-create deals
- Intercom/Zendesk support tickets → Auto-create contacts
- LinkedIn Sales Navigator → Auto-import company lists
- Internal systems → Real-time sync

**Current approach:** If you need live data sync from another system, you have two options:

1. **Build a webhook handler** (requires backend development)
   - Fork/modify the API to add a `/api/webhooks/*` endpoint
   - Since it's open source, you own the code
   - Consider contributing back if others would benefit

2. **Use scheduled imports** (Path 5 below instead)
   - Run CSV imports nightly/weekly from exported data
   - Simpler than webhooks, good enough for most workflows

This is a common feature request and on the long-term roadmap. If you need it now, it's definitely doable — just plan for development time.

---

### Path 5: Scheduled Batch Processing (Recurring Enrichment)

**When:** Need to keep data fresh, catch new trends

**How it works:**
1. **Agent's schedule** (`schedules/dispatch.ts`):
   - Every 3 days: "research the oldest 50 contacts we haven't looked at"
   - Every 14 days: "check if a company founder was in the news"
   - Every 30 days: "refresh company employee lists"

2. **Trigger via agent**:
   - `schedule_recheck(contact_id, "We need to know if they changed roles")` → queues auto-research in 14 days

3. **Reps schedule follow-ups** with a reason:
   - "Check if the project shipped" (7 days)
   - "See if they got promoted" (30 days)
   - "Verify if that competitor deal closed" (5 days)
   → Agent researches at the scheduled time

**Benefit:** Data doesn't go stale; you know *why* the agent is re-checking

---

## Implementation Roadmap: From Empty to Operational

### **Week 1: Foundation**
1. Deploy CRM (Vercel or self-hosted)
2. Configure auth (Google SSO or Microsoft Entra)
3. Manually create first 5–10 test companies/contacts
4. Set up agent bridge (for Agent tab visibility)

### **Week 2: Historical Data**
1. Export from old CRM (Salesforce, etc.) as CSV
2. Map fields: old system → new system schema
3. **Option A:** Write import script (use tRPC API) — if you have developer time
4. **Option B:** Use direct Postgres import — if you have DBA support
5. Dry run on staging; verify data quality
6. Import full dataset to production
7. Run manual data cleanup (merge duplicates, fix typos)

### **Week 3: Live Integration**
1. Connect email sync (Gmail API / Microsoft Graph)
2. Configure cron schedule for mailbox sync
3. Test: send an email to a customer, watch it appear in CRM
4. **Webhook integrations:** Not built-in yet — use scheduled CSV exports instead (nightly/weekly)

### **Week 4: Agent Tuning**
1. Review agent findings (Agent tab on each record)
2. Correct any misidentifications → agent learns
3. Adjust research budget if needed (Context API credits)
4. Set up automated reschedules

### **Ongoing: Agent Feedback Loop**
- Reps use Agent tab to answer agent questions
- Agent improves its research each day
- Less manual data entry over time

---

## Data Structure: What Gets Imported

The CRM tracks three record types:

### **Companies**
```
name, domain, country, industry, 
employee_count, founded_year,
notes, custom_fields[]
```

### **Contacts**
```
first_name, last_name, email, phone,
title, department, company_id,
linkedin_profile, github_account,
notes, custom_fields[]
```

### **Deals**
```
title, amount, currency, stage,
expected_close_date, company_id, contact_ids[],
description, win_probability,
notes, custom_fields[]
```

### **Activity** (auto-captured)
```
type (call, email, meeting, note),
subject, body, participants,
timestamp, associated_contact_id, associated_company_id
```

---

## Agent Capabilities During Enrichment

Once data enters the system, the agent can:

| Capability | Source | Cost |
|---|---|---|
| Read email threads & calendar | Gmail/Outlook sync | Free (part of sign-in) |
| Extract signature blocks | Your own emails | Free |
| Read public GitHub profiles | Public web | Free |
| Search LinkedIn profiles | RAPIDAPI_KEY | Low (credits) |
| Search general web | PERPLEXITY_API_KEY | Low (credits) |
| Get company branding | Context API | Optional |

**No capability is mandatory.** Without any API keys, the system still works—it just reads your own email and does free web research.

---

## Evidence Model: No Guessing

The agent **never guesses.** Every fact it suggests has a source:

```
Contact: "john@stripe.com"
Suggestion: "Title = VP Engineering"
  Source: LinkedIn profile (from email match)
  Evidence level: VERIFIED ← locked in, not moving
  
Suggestion: "Reports to Daniel Stenberg"
  Source: GitHub: Followers file
  Evidence level: PROBABLE ← looks right but needs human check
  
Disputed: "Worked at Facebook" 
  Reason: "Never worked there"
  → Agent won't re-suggest this inference
```

---

## Security & Privacy

- **Mailbox sync is read-only** — can never send, reply, move, or delete emails
- **No customer text in external queries** — derived questions only
- **Agent sandbox has no database access** — can't exfiltrate data
- **No credentials in sandbox** — can't call APIs from shell
- **Audit trail on every change** — who changed what, when, from which source

---

## Typical Week for a Sales Rep

| Day | Action | Agent Does |
|---|---|---|
| **Monday** | Import 20 target accounts | Overnight: research all 20, build profiles |
| **Tuesday** | Review agent findings, correct 2 mistakes | Learns from corrections |
| **Wednesday** | Call 3 prospects (notes sync from email) | Reads call notes, schedules follow-up research |
| **Thursday** | 5 calls, update deal stages | Updates activities, flags at-risk deals |
| **Friday** | Review week: "Why did Acme go quiet?" | Suggests: "Their CTO just left" (found via news) |

---

## Known Limitations (Current Status)

| Limitation | Impact | Workaround |
| --- | --- | --- |
| **No CSV import UI** | Must use API or Postgres to bulk-import | One-time script or database import |
| **No webhook receiver** | Can't auto-sync from external systems | Schedule exports and re-import nightly |
| **VND currency not supported** | Vietnamese businesses can't report in VND | Use USD or EUR for deal amounts, manual conversion, or add VND to source code |
| **Fixed 7 deal stages** | Can't customize pipeline stages from UI | Modify Prisma schema and redeploy |
| **UI is English-only** | Non-English speakers need translation sheet | Contribute translations (open source) |
| **Single-tenant only** | Can't manage multiple companies on one install | Deploy separate instances per company |

---

## FAQ

**Q: How long to go live with real data?**  
A: 1–2 weeks. Import historical data (days 1–3), set up email sync (days 4–5), tune and verify (days 6–10), go live (week 2). Import complexity depends on data size and cleanup needed.

**Q: What if import has errors?**  
A: Use the audit trail to see what changed. Correct manually, or re-run import on a fresh export. The import can be run multiple times (duplicates will be created, but you can merge them).

**Q: Can we have multiple teams/tenants?**  
A: No. This is single-tenant by design. One team per deployment. Large organizations typically run one shared instance or multiple dedicated instances by region/subsidiary.

**Q: What if the agent is wrong?**  
A: Dispute it. Agent learns. Disputed facts never re-suggest. Evidence is always shown, so you can audit why it suggested something.

**Q: Can we export data if we leave?**  
A: Yes. Use `pg_dump` to export the full Postgres database as SQL. Or query via the tRPC API to get JSON. All data is yours, in standard formats.

**Q: Does this work offline?**  
A: No. Needs Postgres and internet for mailbox sync and enrichment APIs. The agent especially needs internet access since it researches publicly available information.

**Q: Can we use currencies other than USD/EUR/GBP?**  
A: Currently supported: USD, EUR, GBP, JPY, CNY, SGD, AUD, CAD, CHF, INR, MXN (11 total). VND and many other currencies are not yet included. Self-hosters can add them to the source code. File an issue on GitHub if your currency is missing.
