# Statement of Work — ES Express Dispatch Automation Platform

**Effective Date:** \***\*\_\_\_\*\***
**Prepared by:** Lexcom Systems Group Inc.
**Prepared for:** ES Express LLC
**Version:** 2026-04-15 (supersedes 2026-04-13 draft)

---

## Preamble

This Statement of Work formalizes the engagement between Lexcom
Systems Group Inc. and ES Express LLC to replace ES Express's
manual spreadsheet-based dispatch workflow with an automated
platform (the "Platform").

We have been creatively engineering a system we hope gives your
team what you asked for, and juggling how to make that delivery
feel natural while the last remaining obstacle to a frictionless
flow — direct PCS OAuth access — remains open. The Platform has
been designed so that every piece that can operate today does,
and every piece that depends on the PCS unlock is pre-built and
waiting on their credentials.

A complete timeline of deliverables through 2026-04-15 is attached
at `docs/2026-04-15-es-express-engagement-timeline.md` and is
incorporated by reference as Exhibit A. That document maps each
feature's completion date to commit-level evidence. We're leaving
it with you as part of this SOW so the engagement record is
self-contained and independently verifiable.

---

## 1. Parties

**Provider:** Lexcom Systems Group Inc. ("Lexcom")
**Client:** ES Express LLC ("ES Express")

---

## 2. Scope of Services

Lexcom will provide ES Express with access to and ongoing
development of a custom-configured dispatch automation platform
that replaces manual, spreadsheet-based dispatch workflows with
an automated system.

### 2.1 Platform Capabilities — Delivered

The following capabilities are built, deployed, and operational as
of this SOW's effective date. Per-feature commit evidence appears
in Exhibit A.

**Data ingestion**

- **PropX API integration** — scheduled sync (4 AM CT full + every
  4 hours refresh), field alias resolution, lbs-to-tons conversion,
  schema-drift detection.
- **Logistiq carrier export** — 2-step JWT auth, order search,
  carrier export API, 31-day chunking, cross-source deduplication.
- **JotForm driver submissions** — 30-minute scheduled sync; photo
  URL allowlisting; field extraction (driver, BOL, weight, truck,
  submission time).

**Matching and reconciliation**

- **Auto-matching engine** — three-strategy cascade (exact
  ticket/BOL → exact load number → driver+date+weight fuzzy) with
  tiered confidence scoring and photo verification gate.
- **Reconciliation service** — field-level comparison between
  photo-extracted data and load records, with severity-classified
  discrepancy surfacing (critical/warning/info).
- **Deterministic field validators** — ported from the bol-ocr-pipeline
  Python implementation; reject OCR output that parses as dates,
  times, addresses, or tokens too short to be valid BOLs before
  the matcher trusts it.
- **Feedback loop** — every manual correction writes a
  driver-to-well signal that the matcher reads on subsequent
  fuzzy-match disambiguation. Original OCR value preserved in
  `original_ocr_bol_no` for future retraining pipelines.

**Dispatcher surfaces**

- **Dispatch Desk** — well-level workspace with Load Count Sheet
  color mirroring, keyboard navigation (j/k), inline editable
  fields (driver, truck, weight, BOL, notes, delivered date),
  batch operations (Shift+A approve, Shift+E mark entered, Shift+V
  validate), photo modal with lightbox, assignee chip with
  per-user color, date range filter, auto-mapped well status.
- **Validation Workflow** — tier-bucketed queue (Tier 1 exact,
  Tier 2 probable, Tier 3 fuzzy), inline editing, bulk approve.
- **BOL Queue** — reconciliation surface showing matched +
  pending JotForm submissions with photo thumbnails, inline BOL
  edit for OCR correction, manual-match flow for unmatched photos,
  discrepancy panel for matched-with-mismatch cases.
- **Missed Loads Report** — on-demand diagnostic report
  (duplicate BOLs, sync errors, loads missing critical fields,
  stale-sync loads).
- **Archive** — read-only historical view of pre-cutoff loads.
- **Admin** — wells admin (rate flags, daily targets),
  users admin (read-only roster).

**Cross-cutting**

- **Photo pipeline** — SSRF-safe proxy with content-type override,
  inline-disposition rendering, 4,200+ photos currently flowing
  through the pipeline.
- **Global search** — by BOL, ticket, load number, driver name.
- **Audit trail** — every assignment tracks state transitions with
  user + timestamp. Every auto-match records "why" in a
  `match_audit` jsonb for operator review.
- **Bridge workflow** — "Copy Report" button exports
  tab-separated ready-to-enter loads for paste into PCS pending
  direct push integration.

**Infrastructure**

- Production deployments on Railway (backend, PostgreSQL) and
  Vercel (frontend) at `app.esexpressllc.com`.
- JWT authentication with role-based access.
- Daily database backups; backups taken before every schema migration.
- Scheduled diagnostic runs (4-hour refresh, 30-minute JotForm
  sync, daily auto-map).

**PCS SOAP due-diligence engineering**

As engineering groundwork while the PCS REST API access process
(ticket DO-2821, opened 2026-03-13) proceeds through the vendor's
standard intake, we built a working SOAP client against the
surfaces available to us. This lets the push-to-PCS flow be
validated end-to-end without taking any action that would require
formal REST credentials to be in place.

- PCS SOAP authentication, session management, circuit breaker.
- `PostDispatch`, `UpdateLoadInfo`, `PostStatus`, `ClearRoutes`
  implemented.
- SOAP was not the intended long-term integration path; REST is.
  This code exists as a safety net and validation tool while REST
  credentials are pending.

### 2.2 Platform Capabilities — In Progress / Gated

These capabilities are built, pre-built, or actively in flight;
each is listed with the dependency that controls its delivery.

- **PCS REST Direct Integration** — Replaces the current "Copy
  Report → paste into PCS" workflow with a one-click
  "Push to PCS" button per load and a batch-push action. Our REST
  client library, request/response contracts, and integration
  path are pre-built; activation is gated on receipt of OAuth
  credentials from PCS. PCS REST API request submitted
  2026-03-09.

- **Income & Clearing Spreadsheet / Report** — Reporting capability
  matching the current PCS Reporter workflows for billing, payroll,
  and clearing reconciliation. This deliverable was covered on
  the final dispatch-team call and is **delivered as dictated by
  this SOW upon signoff/agreement.** Scope, columns, and refresh
  cadence to be finalized in the kickoff of this line item.

- **Clearing status observation** — Read-only view of PropX
  clearing status for dispatch visibility. Depends on PropX export
  API specification finalization.

- **Matcher accuracy climb** — Continuous compounding improvement
  of auto-matching accuracy through the team's correction volume.
  Mechanical, ongoing; no additional deliverable required.

- **Jetson pipeline integration** — Drop-in ingestion endpoint for
  Bryan's Jetson OCR output. Endpoint and validator layer pre-built;
  awaiting sample JSONL record from Bryan to wire the POST route.

### 2.3 Out of Scope (explicit)

The following are not covered by this SOW and would be scoped
separately if requested:

- Native mobile applications for iOS/Android
- PCS replacement / white-label dispatch competitor
- Driver-facing mobile app
- Third-party user licenses (JotForm, PropX, Logistiq, PCS
  subscriptions remain ES Express's responsibility)
- Integration with systems not listed in Section 2.1 or 2.2

---

## 3. Compensation

### 3.1 Monthly Fee

ES Express agrees to pay Lexcom **$5,500.00 USD per month** for
the services described in this SOW.

### 3.2 What the Monthly Fee Includes

- Full access to the Platform for all ES Express users (no
  per-user fees)
- Hosting and infrastructure (Railway, Vercel, PostgreSQL, file
  storage)
- Ongoing support, bug fixes, and maintenance
- Continued feature development and accuracy improvements within
  the scope defined in Section 2
- Data backup and disaster recovery
- Regular communication and progress updates with the dispatch
  team and ES Express leadership

### 3.3 What the Monthly Fee Does Not Include

- Third-party API subscriptions ES Express pays directly (PropX,
  Logistiq, PCS, JotForm).
- Custom development outside Section 2 scope (scoped and quoted
  separately on request).
- Emergency support for incidents caused by changes to third-party
  APIs outside Lexcom's control (handled on a best-effort basis;
  material scope will be quoted separately if rework is required).

---

## 4. Intellectual Property

### 4.1 Lexcom IP

The underlying platform technology, software architecture,
codebase, AI/ML matching algorithms, and extraction pipelines are
and remain the intellectual property of Lexcom Systems Group Inc.
ES Express is granted a non-exclusive, non-transferable license
to use the Platform for the duration of this agreement.

### 4.2 ES Express IP

All of the following are and remain the intellectual property of
ES Express LLC:

- **Business data** — load records, driver information, well
  data, BOL submissions, photos, invoices, settlement records.
- **Workflow configurations** — business rules, tier thresholds,
  color assignments, and process customizations specific to
  ES Express operations.
- **Training data** — validation corrections, manual matches,
  inline BOL edits, original OCR values, and all other signal
  generated through ES Express team usage of the Platform.
- **Integration configurations** — credentials and configuration
  for ES Express's third-party systems.

### 4.3 Data Ownership & Portability

ES Express retains full ownership of their business data at all
times. Upon request or termination, Lexcom will provide a
complete export of all ES Express data in standard formats (CSV,
JSON for structured data; original file formats for photos and
attachments) within 30 days of the request.

---

## 5. Timeline & Milestones

A complete, evidence-backed timeline of engagement activity from
2026-01-15 through 2026-04-15 is attached as Exhibit A
(`docs/2026-04-15-es-express-engagement-timeline.md`). High-level
phase summary below.

### Phase 1 — Platform Build (Complete)

**2026-02-11 → 2026-03-31** (Jace's active build engagement)

- Multi-stream sprint kicked off 2026-02-11 — wells workflow
  engine, CSV-based ingestion, app shell, Google Sheets export
- PCS SOAP due-diligence engineering 2026-02-12 — working client
  built against available surfaces as groundwork while REST access
  proceeds through PCS's vendor process
- Buyer demo delivered 2026-03-04
- PCS REST API outreach drafted 2026-02-27; first vendor reply with
  API docs 2026-03-06; formal questionnaire submitted 2026-03-09;
  PCS ticket DO-2821 opened 2026-03-13
- Logistiq API client code built against published spec;
  operational access formalized via contract execution late March /
  early April 2026
- v2 architecture extraction planned 2026-03-30/31

### Phase 2 — v2 Rebuild + BOL Training + Go-Live (Current)

**2026-03-31 → 2026-04-16**

- v2 clean rebuild on Fastify + Drizzle + PostgreSQL + React 19
- Jessica validation walkthrough 2026-04-06 (1h 14m)
- Full-team follow-up 2026-04-09 (1h 2m)
- Round 2 consolidation — 38 issues surfaced, 43 of 52 total
  asks shipped (83%) as of 2026-04-14
- BOL reconciliation engine hardened; discrepancy detection
  online
- Dispatch team go-live: Wednesday, 2026-04-16 (or start of
  following week per team preference)
- This SOW's signoff triggers the Income + Clearing Report
  work line (Section 2.2)

### Phase 3 — PCS Direct Integration (Pending External Dependency)

**Target: within 2 weeks of receiving PCS OAuth credentials**

- REST-based `Push to PCS` replaces Copy Report button
- Batch push for ready loads
- Bidirectional status reconciliation
- File upload for BOL attachments via File-API

Timeline contingent on PCS approval process (submitted
2026-03-09, awaiting response).

### Phase 4 — Ongoing Operations & Improvement

**Ongoing from go-live**

- Auto-matching accuracy climb via feedback loop
- Feature requests and enhancements per ES Express team priorities
- System monitoring, support, and incident response
- Reporting capabilities buildout per Section 2.2

---

## 6. Term & Termination

### 6.1 Term

This agreement is effective on the date signed and continues on a
**month-to-month** basis.

### 6.2 Termination

Either party may terminate this agreement with **30 days written
notice**. Upon termination:

- Lexcom will provide a complete data export per Section 4.3.
- ES Express retains all IP defined in Section 4.2.
- Platform access will end at the conclusion of the final paid
  month.
- Any outstanding balance is due within 30 days of termination.

---

## 7. Support & Communication

- **Primary contact:** Jace Ryan (Lexcom) — available via phone,
  text, and email
- **Response time:** same business day for urgent issues;
  24 hours for standard requests
- **Scheduled maintenance:** advance notice provided for any
  planned downtime
- **Progress updates:** regular communication with Jessica
  Handlin and the ES Express team throughout active development
  phases. We commit to improving on the communication cadence
  that was not as consistent as it should have been earlier in
  the engagement.

---

## 8. Warranties & Limitations

- Lexcom warrants that the Platform will perform substantially
  in accordance with the capabilities described in Section 2.
- Lexcom will correct any material defects at no additional cost
  during the term of this agreement.
- The Platform is provided for dispatch operations support and
  does not replace human judgment for safety-critical decisions.
- Platform availability targets 99% uptime exclusive of
  third-party API outages (PropX, Logistiq, PCS, JotForm).
  Scheduled maintenance windows are exempt.

---

## 9. Shared Principles

We would like this engagement to operate on three principles we
offer for your review:

1. **Honest communication on both sides.** When something ships,
   we will tell you clearly what's operational now and what's
   still hardening. When something is blocked, we'll name the
   dependency without shifting blame.

2. **Data is yours, unconditionally.** Not just on termination —
   on request, any time. If your team wants a CSV of every
   validation decision for an internal audit, you get it.

3. **Scope changes in writing.** Neither of us wants a
   conversation in three months about whether X was in scope.
   Any material additions get added to this SOW (or a companion
   amendment) and acknowledged by both parties.

---

## 10. Signatures

**Lexcom Systems Group Inc.**

Name: \***\*\_\_\_\*\***
Title: \***\*\_\_\_\*\***
Date: \***\*\_\_\_\*\***
Signature: \***\*\_\_\_\*\***

**ES Express LLC**

Name: \***\*\_\_\_\*\***
Title: \***\*\_\_\_\*\***
Date: \***\*\_\_\_\*\***
Signature: \***\*\_\_\_\*\***

---

## Exhibits

- **Exhibit A** — Engagement Timeline (`docs/2026-04-15-es-express-engagement-timeline.md`)
- **Exhibit B** — Decision Log (`docs/2026-04-14-decision-log.md`)
- **Exhibit C** — Feedback Ledger (`docs/2026-04-14-feedback-ledger.md`)

---

_This Statement of Work constitutes the complete agreement between
the parties regarding the services described herein and supersedes
any prior verbal estimates or preliminary discussions, including
the 2026-04-13 draft. We welcome any notes, questions, or
adjustments to scope — this document is meant to align on
deliverables, not impose them._
