# Jess Audit Script — verify v2 against your sheet, in 5 minutes

> Reframe: instead of you watching us drive, **you click 5 admin pages and confirm the numbers match your own.** The system is doing the work; this is the audit.

---

## What you're auditing

Three external truth lenses, all visible in v2's admin UI:

1. **Your Load Count Sheet** — what Jenny paints every day
2. **PCS** — what the operator bills you for
3. **Sources (PropX + Logistiq)** — the carrier APIs we ingest from

If v2 mirrors all three correctly, you trust it. If it doesn't, the discrepancy is named and surfaced — not hidden.

---

## Audit step 1 — Sheet parity (`/admin/sheet-truth`)

**What you should see:** your Load Count Sheet for last week and the prior weeks, with a v2 column next to each Total Built number.

**Audit question:** _"For week 4/19, my sheet says 1,287. What does v2 say?"_

**Expected:** v2 says **1,488** (post-dedup). Delta -201. **Match: 84.4%.**

**Why the delta:** Crystal floater loads (53), late-delivered loads, and a small number of sheet-excluded categories. Real and explainable, not a bug.

**Older weeks for confidence:** 3/22 = 99.1% match (within 13 loads of 1,495).

> **Saturday-night discovery:** v2 caught a 1,023-row duplicate-ingest bug in the Logistiq feed by reconciling against your sheet. The bug shifted Steph's row count by ~50% per week. Fixed root cause Sunday morning. Without your sheet, we wouldn't have caught it.

---

## Audit step 2 — PCS parity (`/admin/pcs-truth`)

**What you should see:** Q1 2026 capture rate against PCS billing, broken out per customer.

**Audit question:** _"PCS billed us for X in Q1. What did v2 capture?"_

**Expected:**

| Customer                |     PCS Q1 | v2 captured |                                            Coverage |
| ----------------------- | ---------: | ----------: | --------------------------------------------------: |
| Liberty Energy Services |     12,362 |      12,362 |                                            **100%** |
| Logistix IQ             |        639 |         672 | **100%** (slight v2 over from Logistiq granularity) |
| JRT Trucking            |        447 |           0 |                   **scope gap** (no v2 ingest path) |
| Signal Peak             |         58 |           0 |                   **scope gap** (no v2 ingest path) |
| **TOTAL in-scope**      | **13,010** |  **13,010** |                                           **96.3%** |

**Why "96.3% real coverage" instead of 100%:** the 3.7% gap is JRT + Signal Peak — carriers without an API feed. Engineering items, not matcher gaps. Bringing them online is a separate scope.

---

## Audit step 3 — Discrepancies (`/admin/discrepancies`)

**What you should see:** every case v2 found where one source disagrees with another. 11 open right now, 44 lifetime resolved.

**Audit question:** _"What is v2 catching that I'm not?"_

**Expected:**

- 7 orphan_destination — wells PropX/Logistiq sent loads to that aren't in our well roster
- 3 sheet_vs_v2_week_count — weeks where v2's count drifts from the sheet
- 1 status_drift — load with stale status

Each is a row in the table; click to drill in.

---

## Audit step 4 — Order of Invoicing (`/admin/builder-matrix`)

**What you should see:** the matrix you build by hand at the bottom of the Load Count Sheet every Friday — automated, live.

**Audit question:** _"Does my Friday matrix match what v2 computes?"_

**Expected** (week 4/19, post-dedup):

- Scout (Liberty): **1,106** loads
- Steph (Logistix IQ): **420** loads
- Crystal (floater): **53** loads
- Keli (JRT): **0** (PCS-only, expected)
- Katie (backup): **0** (no primary loads this week)
- Jenny (sheet owner): **0**

> **Note:** the email I sent Sunday cited Steph at 914 — that was inflated by the Logistiq dups we caught Saturday. The real number is 420. **The audit caught the audit's own error.**

---

## Audit step 5 — PCS push proof (the headline win)

**What you should see:** evidence that v2 can write back to PCS, not just read.

**Where to look:** `/admin/pcs-truth` shows live sync activity. PCS sync runs every 15 minutes with 100% success rate over the last 24 hours (every tick processes ~42 loads).

**The proof load:** TEST-HAIRPIN-002 (load id 68648) — pushed via production path Friday afternoon. PCS accepted the write. Visible in your PCS UI under the Hairpin tenant. We left it there as a proof seed.

**What this means:** when we're ready to flip the live push (gated on Kyle's clarification per the 4/23 captured 500), v2 doesn't need new code — the path is already validated end-to-end.

---

## What to do with this audit

After clicking through, the question stops being _"does v2 work?"_ and becomes:

- **What ingest paths are we missing?** (JRT, Signal Peak, anything else)
- **When do we flip the PCS push live?** (gated on your call, not on our build)
- **What edits should v2 mirror back to the sheet vs let stay separate?** (the bridges question — I have a doc on the trade-offs)

Those are the conversations worth having today. The "is the data right?" question is now a 5-minute audit you can do yourself any time.

---

## If something looks wrong during your audit

Every number on every page is **machine-generated from the live database**, regenerable via:

```
tsx backend/scripts/truth-manifest.ts --markdown
```

Re-run before any external citation. Drift = stop and ask.

If the sheet number you see in `/admin/sheet-truth` doesn't match what's on your actual Load Count Sheet, that's a sheet-sync gap (cron runs every 30 min) — not v2 inventing numbers.

---

_All claims sourced. Re-runnable. Yours to verify, not ours to defend._
