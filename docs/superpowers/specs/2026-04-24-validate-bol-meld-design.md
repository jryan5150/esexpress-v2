# Validate + BOL Center Meld — Pre-Dispatch Verification Surface

**Date:** 2026-04-24
**Author:** jryan + Claude
**Status:** Draft → execution begins same day, full surface lands Monday 2026-04-27
**Trigger:** Bryan + Jessica's Apr 15 call — "meld the BOL queue with validation" / "nothing would go to dispatch desk until it had been validated"

---

## Problem

Today the dispatcher's "is this load ready?" workflow is split across two pages with overlapping data:

| Page | What it answers | Source |
|------|-----------------|--------|
| `/validation` | Auto-mapped assignment — is the well right? | tier 1/2/3 buckets of `assignments` |
| `/bol` (Reconciliation tab) | Driver's photo arrived — what load does it belong to? | `jotform_imports.status='pending'` |

These are not separate workflows. They are two angles on the same gate: **a load cannot enter dispatch until both halves are verified.**

Jessica's exact words on Apr 15:

- "I would go to the validation page... I would hit validate, validate" (sequential cranking)
- "as long as I have something where I can go in and kind of sort and do a day's worth at a time" (date-bound batching)
- "I would come here, but I don't see a picture" (photo must be visible inline)
- "in my mind, nothing would go to dispatch desk until it had been validated" (one pre-dispatch step, not two)

Bryan, same call: "meld the BOL queue with validation."

## Decision

Make the Validate page the single pre-dispatch verification surface. BOL Center work that gates dispatch (photo→load matching, missing tickets) becomes sections of the Validate queue. BOL Center stays as a *library/audit* surface for "I want to look up what photos exist regardless of match state."

Mental model after meld:

```
Validate (Pre-Dispatch Verification)         BOL Center (Photo Library)
├── Awaiting confirm (Tier 1/2/3)            ├── All JotForm submissions (browse + search)
├── Awaiting photo match (orphan photos)     ├── All PropX photos (browse + search)
└── Missing ticket (load with no photo)      └── Filter by date / driver / status
   └── filter: today | this week | all
```

Validate answers "what do I need to do *right now*?" BOL Center answers "what's *in the system*?"

## Ordering — by date, default today

Lead sort = `delivered_on DESC`, default filter = today. Within a date, group by work type but render in one scroll-friendly list:

1. **Awaiting confirm** (assignment matched, just needs a click)
2. **Awaiting photo match** (photo arrived, doesn't have a load)
3. **Missing ticket** (load exists but no photo arrived — flag, not block)

Tier confidence stays as a badge on the row, not a sort axis. Jessica trusts the system to surface uncertainty; she doesn't want to manually triage Tier 1 vs Tier 3 each day.

## Photo affordance

Every row shows a 48×48 thumbnail inline. Click → photo modal with zoom + arrow-key cycling (already built in BOL Center, lift the modal component).

For "awaiting photo match" rows, the thumbnail IS the matching affordance — clicking the image opens the same modal but with a load-search input below it (the existing `ManualMatchPanel` component, lifted from `BolQueue.tsx`).

## Components to lift / share

| Component | Today | After meld |
|-----------|-------|------------|
| `ManualMatchPanel` | BolQueue inline | Extract to `components/ManualMatchPanel.tsx`, used by both |
| Photo modal (zoom + cycle) | BolQueue inline | Extract to `components/PhotoModal.tsx`, used by Validate + Workbench |
| `DiscrepancyPanel` | BolQueue inline | Extract to `components/DiscrepancyPanel.tsx`, used by both |
| `BOLDisplay` | already shared | unchanged |

## Sidebar + naming

- "Validate" stays the primary label (Jessica's vocabulary)
- Tooltip / subtitle: "Pre-dispatch verification — confirm assignments, match photos, see missing tickets"
- "BOL Center" remains in sidebar but moves below Validate, framed as a library

## Out of scope for this meld

- Bulk approve "Tier 1 with photo" — already exists on Validate, keep
- Re-OCR controls, JotForm health endpoints — admin/diag, not Jessica's surface
- Workbench (post-validation dispatch surface) — unchanged
- PropX photo browser — stays in BOL Center as audit tool

## Phased rollout

**Phase 1 (today, before 3:30 PM email):** Surface bridge only.
- Add "Awaiting Match" callout to Validate page header showing count of pending JotForm submissions
- Click → opens BOL Center reconciliation tab
- Sidebar tooltip update
- Goal: prove direction to Jessica in the email + screenshots

**Phase 2 (Monday 2026-04-27):** Full meld.
- Date filter on Validate (today / this week / all)
- "Awaiting Match" section inline on Validate using lifted `ManualMatchPanel`
- "Missing Ticket" section inline on Validate using existing `useMissingTickets` hook
- Photo modal extracted + reused
- BOL Center reframed as library

**Phase 3 (post-Monday, if wanted):** Polish.
- Within-date sub-grouping toggle
- Keyboard shortcut: `j/k` to navigate rows, `space` to confirm, `m` to open match panel
- Persist last-used filter per user

## Verification

- Phase 1: open `/validation` → see "Awaiting Match" callout with non-zero count, click → land on BOL reconciliation tab
- Phase 2: open `/validation` → can do an entire day's pending verification work (assignment confirms + photo matches + missing-ticket awareness) without leaving the page

## Risks

- **Visual density** — Validate already has Tier 1/2/3 sections. Adding two more sections risks overload. Mitigation: collapse "missing ticket" by default, show only count + expand affordance.
- **Concurrent edit safety** — confirming an assignment while a photo simultaneously matches to it. Existing services handle idempotently (status check before write); add an integration test.
- **Cache invalidation** — confirming an assignment on Validate must invalidate BOL Center queries too. Use `queryClient.invalidateQueries` with shared key prefixes.

---

_Spec written 2026-04-24 ~3:08 PM CDT before the 3:30 PM Jessica email send. Phase 1 ships within the same window; Phases 2-3 land Monday._
