# Healthcare CRM Reshape: 80/20 Review Complete — Scope Inverted to Value-First Phases

**Date**: 2026-08-13 17:40–end of session  
**Severity**: None  
**Component**: Product roadmap, schema/i18n scope, data integration  
**Status**: DONE — v2 roadmap locked

## What Happened

Advisory session: three haiku subagents verified codebase claims about the healthcare CRM reshape proposal. Findings rewrote the cost/benefit picture and flipped the roadmap from code-first (Membership, Contacts, Journey) to value-first phases (face, agent wedge, data, documents).

## The Brutal Truth

The feared i18n rebuild (1,512 keys) was 10x overstated. Actual scope: 971 catalog keys total, only 112 carry sales vocabulary and 29 reference "contact." Full schema rename (Deal→Journey, Contact→Client, Company→Organization) would touch 700–830 files per model, destroy Postgres enums, scatter event names into AgentTrigger JSON, and break tRPC contracts. All for zero user-visible gain. Luan killed it on the spot with a single phrase: "It's stupid to rename schema+code for this purpose." One decision ending weeks of sunk thought.

## Key Findings Changed Plan

1. **Membership fits existing fields:** agentFilled boolean + schedule_recheck timestamp. Days, not weeks.
2. **Appointments surface is widgets over CalendarEvent.** Minimal new schema.
3. **Documents is the largest build:** blob storage (image-only v1), no per-record authz, days of work not months.
4. **Retention features have real data gap:** renewal watch and lapsed reactivation read visit data. Sync supplies only rep consultations. CSV import (v1 bridge) fills the gap; unverified whether import code already exists.
5. **Vietnamese person-term needs native review.** Not yet assigned.

## Decisions Locked

- Relabel only at i18n layer; no schema refactor. Drive with repo-local Claude Code skill operating haiku subagents.
- Documents v1: minimal uploads, no role gates.
- CSV client/visit import in v1.
- Roadmap inverted: A (face), B (agent wedge), C (data), D (documents), E (future triggers).

## Impact & Next

Two reports written: v2 plan at `plans/reports/brainstorm-260813-1601-healthcare-crm-reshape-report.md`; product review at `plans/reports/brainstorm-product-review-260813-1740-healthcare-8020-cut-report.md`. Open risks: CSV import code existence unverified; fork production data state unknown; Vietnamese review pending assignment.

---

**Status**: DONE  
**Summary**: 80/20 review eliminated schema refactor, verified data gaps, locked value-first roadmap.
