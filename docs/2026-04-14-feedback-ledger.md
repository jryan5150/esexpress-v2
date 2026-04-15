# ES Express Dispatch Team Feedback Ledger

**Generated:** 2026-04-14
**Last updated:** 2026-04-14 (post-ship batch — 13 additional items landed)
**Sources:**

- _2026-04-06 validation-walkthrough transcript_ (Jessica, 1h 14m)
- _2026-04-09 team-follow-up transcript_ (full team, 1h 2m)
- _2026-04-06 round-2-consolidation_ (38 issues)
- Round 2 per-persona reports (Jessica / Stephanie / Katie / Admin)
- _2026-04-06 validation-call-findings_
- `git log main --oneline` (ship verification)

## Executive Summary

- **Total asks captured:** 52 (38 Round-2 + 14 new from transcripts)
- **Shipped (verified via git + code):** 43 (83%)
- **Partial / in-progress:** 0
- **Open:** 2 (4% — both large-effort, deferred-by-scope)
- **Blocked on external:** 2 (4%)

**Items still open:**

1. User invite / role / deactivate flow — admin, large
2. Architecture: BOL + Validation reconciliation feel decoupled — large

**Blocked on external:**

3. PCS auto-push integration + PCS-dependent color statuses —
   waiting on PCS REST OAuth credentials
4. Keyboard navigation between loads — Stephanie, medium

---

## SHIPPED (verified against git + live code)

| #    | Ask                                                                           | Source                  | Verified           | Commit                                    |
| ---- | ----------------------------------------------------------------------------- | ----------------------- | ------------------ | ----------------------------------------- |
| S-01 | ES Express LLC logo on login + sidebar                                        | Jared / Apr 9 40:31     | ✓ live             | `829eda0` (merged today)                  |
| S-02 | Cobalt primary + cream backgrounds (swap from purple)                         | Jared                   | ✓ live             | `3aa3243` via merge `829eda0`             |
| S-03 | Collapsible sidebar with admin grouping                                       | Jared                   | ✓ live             | `c85ca1f` via merge `829eda0`             |
| S-04 | Load Count Sheet color coding on rows                                         | Apr 9 16:23             | ✓ today            | `ad8b1d2`, `a72324d`                      |
| S-05 | Color Key legend popover                                                      | Apr 9 16:34             | ✓ today            | `ad8b1d2`                                 |
| S-06 | Date range filter (from→to)                                                   | Apr 9, R2               | ✓ today            | `a72324d`                                 |
| S-07 | Match audit UI on load drawer                                                 | Jessica validation call | ✓                  | `b4aa9f0`, `94a07a2`                      |
| S-08 | Auto-mapper anti-hallucination rules                                          | Validation findings     | ✓                  | `e15a6e8`                                 |
| S-09 | Archive / historical complete banner                                          | Apr 6 validation call   | ✓                  | `79180a9`                                 |
| S-10 | Historical-complete classifier on sync                                        | Apr 6 "archive vs live" | ✓                  | `f50e97b`                                 |
| S-11 | Visible "Search BOL" button (M8)                                              | Validation call 23:15   | ✓                  | `de148d1`                                 |
| S-12 | Logistiq carrier export (no session auth)                                     | Operational             | ✓                  | `43e6b2a`                                 |
| S-13 | `weight_lbs` column + sync population                                         | Round 4                 | ✓                  | `3d9a5bf`, `5d91282`                      |
| S-14 | P0-3 single-load Validate confirm                                             | Round 2                 | ✓                  | shipped (confirm pattern in DispatchDesk) |
| S-15 | P0-4 Missing Ticket button — wired then disabled with tooltip                 | R2 → R3 → R4            | ✓ current state    | `6e506ab` → `6ea015a`                     |
| S-16 | P2-6 Advance All confirmation                                                 | Round 2                 | ✓                  | `53a5eea`                                 |
| S-17 | P2-8 Pagination reset on filter change                                        | Round 2                 | ✓                  | `e0439d8`                                 |
| S-18 | P1-4 onClaim in Loads view                                                    | Round 2                 | ✓                  | `b8ff924`                                 |
| S-19 | P1-12 "Entered" → "Mark Entered"                                              | Round 2                 | ✓                  | `22cfec4`                                 |
| S-20 | P2-1 Demurrage panel recolor                                                  | Round 2                 | ✓                  | `5d37e56`                                 |
| S-21 | P2-7 Jargon tooltips (BOL, FSC, Reconciled, Tiers)                            | Round 2 / Katie         | ✓                  | `9ac11aa`                                 |
| S-22 | P1-11 prefers-reduced-motion animation cap                                    | Round 2                 | ✓                  | `d1ea180`                                 |
| S-23 | P2-3 "Last updated" pill on home Objectives                                   | Round 2                 | ✓                  | `b39dee3`                                 |
| S-24 | P1-8 Companies admin behind feature flag                                      | Round 2                 | ✓ current: visible | `902b39e` + revert `ec4fb64`              |
| S-25 | Pill text readability per-hex luminance                                       | Apr 14 team note        | ✓ today            | `a72324d`                                 |
| S-26 | enteredIds persists across page refresh (P1-5)                                | Stephanie R2            | ✓ today            | `feae3c9`                                 |
| S-27 | LoadRow checkbox keyboard accessible (P1-3)                                   | R2                      | ✓ today            | `feae3c9`                                 |
| S-28 | Loads view row click expands drawer in place (P0-6)                           | Stephanie R2            | ✓ today            | `feae3c9`                                 |
| S-29 | PhotoModal "Flag for Jessica" wired (P1-6)                                    | R2                      | ✓ today            | `feae3c9`                                 |
| S-30 | WellsAdmin pencil edits dailyTargetLoads (P0-1)                               | Admin R2                | ✓ today            | `feae3c9`                                 |
| S-31 | WellsAdmin defaults to Active filter (P2-9)                                   | Admin R2                | ✓ today            | `feae3c9`                                 |
| S-32 | WellsAdmin paginates 25/page (P2-10)                                          | Admin R2                | ✓ today            | `feae3c9`                                 |
| S-33 | PCS numbering correct under filters (P1-7)                                    | Stephanie R2            | ✓ today            | `feae3c9`                                 |
| S-34 | PropX `staging_*` schema-drift fields known                                   | Apr 14 sync log         | ✓ today            | `feae3c9`                                 |
| S-35 | Copy ready-loads-as-TSV report (P2-2)                                         | Jessica R2              | ✓ today            | `feae3c9`                                 |
| S-36 | Home "Confirmed & Ready" card clickable (P1-10)                               | Stephanie R2            | ✓ today            | `feae3c9`                                 |
| S-37 | Inline editable assignment notes (O-05)                                       | Jessica Apr 6           | ✓ today            | `ef40761` + migration `0008`              |
| S-38 | Keyboard navigation between rows (j/k/↑/↓/Enter/Esc)                          | Stephanie R1 + Apr 9    | ✓ today            | `ef40761`                                 |
| S-39 | Validation page: more inline edits + pencil affordance (P2-4)                 | R2                      | ✓ today            | `29996ae`                                 |
| S-40 | Photo gate on dispatch_ready transition (P-03)                                | Jessica Apr 6 ~54:20    | ✓ today            | `d6d979c`                                 |
| S-41 | Need Well Rate Info status wired (O-23) — admin checkbox + 6th color now live | Apr 9 + admin           | ✓ today            | `d6d979c` + migration `0009`              |
| S-42 | Missed Loads Report — pull-style page Jessica runs on demand (O-16)           | Jessica Apr 6           | ✓ today            | `d6d979c`                                 |
| S-43 | Mark Entered button now in ExpandDrawer (P-01)                                | Stephanie R2 (P1-2)     | ✓ today            | `d6d979c`                                 |

## PARTIAL (in-progress / partly-addressed)

| #    | Ask                                     | Source              | What's done                                                           | What's missing                                                                           | Effort |
| ---- | --------------------------------------- | ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| P-01 | Mark Entered control in ExpandDrawer    | Stephanie R2 (P1-2) | Button exists in LoadRow only                                         | Add to drawer — dispatchers open drawer more than they row-click                         | small  |
| P-02 | Contrast / readability pass             | Jared + Apr 9 team  | Jared's pass + pill contrast today                                    | Full a11y audit with team review                                                         | medium |
| P-03 | Photo requirement in "100% ready" logic | Jessica Apr 6       | `isTier1 = hasAllFieldMatches && hasPhoto` rule exists in match-rules | Not yet applied to auto-promote logic — Tier 1 still allowed without photo in some paths | small  |

## OPEN (ready to work on)

All "Now" + most "This week" items shipped 2026-04-14. Remaining open items
are large-effort (≥4 hrs) or explicitly deferred.

| #    | Ask                                                           | Source      | File hint                                                                                                 | Effort |
| ---- | ------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | ------ |
| O-12 | P0-5 User invite / role / deactivate flow absent              | Admin R2    | `auth/routes.ts` + `UsersAdmin.tsx`, `invite.ts` orphaned                                                 | large  |
| O-13 | P1-9 Admin pages client-side role-gated                       | Admin R2    | **explicitly skipped per `project_admin_rbac_intentional.md`** (all users admin during rollout)           | — skip |
| O-24 | BOL + Validation reconciliation feel decoupled (architecture) | Apr 6 audit | larger refactor surfaced when discussing how matching informs validation; not blocking but worth re-think | large  |

### Post-PCS (needs OAuth credentials from Kyle)

| #    | Ask                                                                  | Source        | Blocking                                 | Effort after unblock |
| ---- | -------------------------------------------------------------------- | ------------- | ---------------------------------------- | -------------------- |
| O-18 | "Validate" → "Push to PCS" button rename                             | Apr 9 25:00   | PCS OAuth                                | trivial              |
| O-19 | Push-to-PCS actual integration (vs copy/paste)                       | Jessica Apr 9 | PCS OAuth + Kyle                         | large                |
| O-20 | "Loads Being cleared" / "Loads cleared" status colors wired (2 of 9) | Apr 9         | PCS OAuth (observability)                | small                |
| O-21 | "Export (Transfers) Completed" status wired                          | Apr 9         | PropX export API spec                    | small                |
| O-22 | "Invoiced" status wired                                              | Apr 9         | Finance module integration               | small                |
| O-23 | "Need Well Rate Info" status wired                                   | Apr 9         | New `well.rate_status` column + admin UI | small                |

## BLOCKED (external)

| #    | Ask                                                             | Dependency                         | Owner |
| ---- | --------------------------------------------------------------- | ---------------------------------- | ----- |
| B-01 | PCS OAuth credentials for all `O-18` through `O-20` items above | PCS vendor REST API access process | PCS   |

---

## Appendix A — NEW items from Apr 6 + Apr 9 transcripts (not in Round 2 consolidation)

These surfaced in the recordings but weren't captured in the written Round 2 docs. All tracked above in the OPEN section unless noted.

| Apr 6 Validation Walkthrough         |                |                              |
| ------------------------------------ | -------------- | ---------------------------- |
| Inline comments on loads             | 21:45-ish      | O-05                         |
| Photo requirement strict enforcement | 54:20          | P-03                         |
| Missed-loads on-demand report        | ~48:00         | O-16                         |
| Live data before finalizing workflow | entire session | covered by today's migration |

| Apr 9 Team Follow-up                              |             |                                              |
| ------------------------------------------------- | ----------- | -------------------------------------------- |
| Load Count Sheet color scheme → UI                | 16:23-16:34 | S-04, S-05 ✓ shipped today                   |
| Date range lookup                                 | ~18:00      | S-06 ✓ shipped today                         |
| "Validate" button will need rename when PCS lands | 25:00-27:02 | O-18 deferred                                |
| Red flag on ticket mismatches (PropX-like)        | 27:20       | partly covered by match_audit reasons (S-07) |
| "Hard to visualize without live data"             | Scout 35:00 | resolved today (real DB live)                |
| Jared contrast + logo changes                     | 40:31       | S-01, S-02, S-03                             |

---

## Inconsistencies resolved

Round 2 consolidation listed some items as open that git shows as shipped. I verified each and moved them to SHIPPED above: P2-6, P2-3, P1-12, P1-11, P2-7, P2-1, P2-8, P1-4.

Round 2 P0-4 (Missing Ticket) was shipped, then intentionally reverted to disabled-with-tooltip per commit `6ea015a`. Current state is the intended state.

Round 2 P0-2 (Delivered Date inline-edit broken schema) is fixed — `backend/src/plugins/dispatch/routes/loads.ts:108` now declares `deliveredOn`.

Round 2 P1-1 (`capitalize` mangling) is fixed in `FilterTabs.tsx` (removed in Round 3). Leftover `capitalize` in `BolQueue.tsx:206` was benign (labels already cased) — removed 2026-04-14 for hygiene.

---

_Maintained alongside session hand-offs. Update after each validation session or ship event._
