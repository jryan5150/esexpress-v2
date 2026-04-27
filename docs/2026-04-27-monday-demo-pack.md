# Monday Demo Pack — 2026-04-27

> One doc to walk in with. Skim top to bottom in 5 minutes.

---

## In 30 seconds

**Open with this:**

> "I'd like to invert today. Instead of me driving the demo, I want you to audit five admin pages I built. Each one shows your truth — your sheet, your PCS — against what v2 sees. You'll tell me where v2 disagrees with reality, not the other way around."

**Then share:** [`docs/2026-04-27-jess-audit-script.md`](./2026-04-27-jess-audit-script.md) — five clicks, expected number per page.

**Three things you NEED from her on this call:**

1. **FSC math per well** — miles or weight? And where does the rate come from?
2. **Liberty(FSC) vs Liberty** — same customer different rate, or different billing entity?
3. **Driver Codes** — which sheet has the canonical roster? (the one we sync only has 45 rows)

That's the win condition: she leaves having answered those three.

---

## The numbers you can defend

| Claim                         | Number                                                                | Where to verify                           |
| ----------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| PCS Q1 capture (in-scope)     | **96.3%**                                                             | `/admin/pcs-truth`                        |
| Photo attachment rate         | **97%** of 55K+ assignments                                           | `tsx backend/scripts/numbers-snapshot.ts` |
| Sync run success last 24h     | **97%+**                                                              | `/admin/pcs-truth`                        |
| Sheet vs v2 weekly match      | **84-99%** depending on week                                          | `/admin/sheet-truth`                      |
| Liberty wells: per-well delta | within **0-10 loads** of sheet                                        | `/admin/sheet-truth`                      |
| Saturday catch                | **1,023-row Logistiq dup-ingest** found via sheet recon, fixed Sunday | doc §F below                              |

**Numbers to AVOID without context:**

- "X loads dispatched" — auto-promote not shipped
- Driver-codes anything — table empty pending Jess
- Total v2 load count alone — meaningless without sheet/PCS context

---

## Service account email — share this if she has more sheets

We currently sync 5 spreadsheets. If Jess has another sheet we should be reading, **she shares it with this email**:

```
esexpress-integration@esexpress.iam.gserviceaccount.com
```

**How:** open the sheet → Share → paste that email → "Viewer" access → uncheck "Notify people" → Send.

Within 30 minutes the next sheet sync picks it up. No code change needed.

**Sheets we already have access to:**

- Load Count Sheet
- Master Dispatch (Driver Codes + Sand Tracking tabs)
- 1560+ Invoice Sheet
- 2× Liberty cuts

**The ask line on the call:**

> "If there's a sheet you use that we're not seeing, share it with `esexpress-integration@esexpress.iam.gserviceaccount.com` — viewer access. Within 30 minutes we're reading it. We'll get the schema-mapping from you separately."

---

## PCS push — honest status

**Code path exists, push is staged, no production write yet.**

| Load     | v2 location                                                                      | PCS state                          |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| id=68647 | [`/load-center?load=68647`](https://app.esexpressllc.com/load-center?load=68647) | NULL pcs_number, assignment failed |
| id=68648 | [`/load-center?load=68648`](https://app.esexpressllc.com/load-center?load=68648) | NULL pcs_number, assignment failed |
| id=68649 | [`/load-center?load=68649`](https://app.esexpressllc.com/load-center?load=68649) | NULL pcs_number, assignment failed |

Push paused 4/23 pending Kyle's response on a captured 500 (per memory).

**If she asks "show me a pushed load":** pivot to `/admin/pcs-truth` and lead with the read story.

> "Push is built and staged. Production write is paused on Kyle's 500 from 4/23 — we have three seed loads ready when the gate lifts. The bigger value is the read side, which IS live."

---

## The 5 admin pages she audits (in this order)

1. **`/admin/sheet-truth`** — your sheet vs v2 per week. Audit: "for week 4/19, my sheet says 1,287. What does v2 say?" Expect 1,488 (84% match post-dedup).

2. **`/admin/pcs-truth`** — PCS Q1 capture. Liberty 100%, Logistix 100%, JRT/Signal Peak in scope-gap.

3. **`/admin/discrepancies`** — every cross-source mismatch v2 found. 11 open right now, 44 lifetime resolved.

4. **`/admin/builder-matrix`** — Order of Invoicing (the matrix she builds Friday). Scout 1,106 / Steph 420 / Crystal 53 (post-dedup).

5. **`/admin/sheet-status`** — the painted colors v2 reads from the sheet, mapped to workflow states.

That's the audit. After she's clicked these she'll either trust the system or tell you exactly where it's wrong — both are wins.

---

## The questions for Jess (P0 first)

**P0 — won't ship without her input:**

1. **FSC method per well** — miles formula `fscRate × loads.mileage` or weight formula `fscRate × loads.weightTons`? Plus the rate source (published index? customer contract?). Toggle column shipped today on `wells.fsc_method`.
2. **Liberty(FSC) vs Liberty** — sheet has 5 spellings totaling 16,666 Q1 loads; PCS only sees 12,362 under "Liberty Energy Services, LLC." Same customer different rate sheet, or different entity?
3. **Driver Codes canonical sheet** — Master Dispatch "Driver Codes" tab has 45 rows. Real list is ~983. Which sheet has the roster?

**P1 — unlocks v2 behavior:**

4. **Auto-promote** — has she seen assignments advance from `uncertain` → `ready_to_build` without anyone touching them? CLAUDE.md says feature-flagged off; code shows always-on.
5. **What does she call the long numeric BOL** (PropX `86876565552` / Logistiq `AU2604...`)? We hid it; need her name for it.
6. **Sheet's Discrepancy column (col U)** — should v2 use her hand-calc as a third reconciliation signal?

**P2 — strategic:**

7. **PCS push** — when does she want us to flip the live write?
8. **JRT + Signal Peak** — when do those carrier feeds become available?
9. **Crystal + Jenny accounts** — send their first magic-link now or hold? (both seeded, magic-link only)

---

## Saturday catch — the headline win

While reconciling against Jenny's sheet on Saturday, v2 caught a **1,023-row Logistiq duplicate-ingest bug**. Same physical load was being ingested 2-4 times because the sync's source-id generator was falling through to a hash that shifted every time the load's billing state changed (`New → ReadyToBill → Billed`). Fixed Sunday morning by pinning source-id to the BOL number.

**The line:**

> "Without your sheet, we wouldn't have caught that bug. The system needs your sheet to be correct."

That's the trust seed for the whole engagement: v2 isn't replacing her — it's depending on her.

---

## What's deployed today

| Surface                               | URL                     | Notes                                               |
| ------------------------------------- | ----------------------- | --------------------------------------------------- |
| Worksurface (well grid + cell drawer) | `/workbench`            | Click cells → drawer with per-load detail           |
| Load Center (single-load workspace)   | `/load-center?load=ID`  | NEW today — read-only, inline edit Tuesday          |
| Sheet Truth                           | `/admin/sheet-truth`    | Now alias-aware (canonical Bill To)                 |
| PCS Truth                             | `/admin/pcs-truth`      | 96.3% capture                                       |
| Discrepancies                         | `/admin/discrepancies`  | 11 open, 44 resolved                                |
| Builder Matrix                        | `/admin/builder-matrix` | Post-dedup numbers                                  |
| Aliases admin                         | `/admin/aliases`        | NEW — Jess can self-edit sheet → canonical mappings |
| Wells admin                           | `/admin/wells`          | Rate, FFC, FSC, mileage editable                    |

---

## Files in this pack

| File                                                                         | What it has                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| **THIS DOC**                                                                 | One-pager to walk in with                   |
| [`2026-04-27-jess-audit-script.md`](./2026-04-27-jess-audit-script.md)       | The 5-step audit Jess does herself          |
| [`2026-04-27-v2-mapping-matrix.md`](./2026-04-27-v2-mapping-matrix.md)       | How v2 actually works, sourced to file:line |
| [`2026-04-27-q1-tri-recon.md`](./2026-04-27-q1-tri-recon.md)                 | PCS + Sheet + v2 by customer                |
| [`truth-manifest.md`](./truth-manifest.md)                                   | Cite-ready numbers (machine-generated)      |
| [`truth-manifest.json`](./truth-manifest.json)                               | Same data, machine-readable                 |
| [`2026-04-27-jess-lens-cheatsheet.md`](./2026-04-27-jess-lens-cheatsheet.md) | Per-page expectations + bug responses       |

---

## Re-run anything (copy-paste)

```bash
# Cite-ready numbers
tsx backend/scripts/truth-manifest.ts --markdown > docs/truth-manifest.md

# Per-customer Q1 tri-recon
tsx backend/scripts/q1-tri-recon.ts > /tmp/recon.md

# Full audit snapshot
tsx backend/scripts/numbers-snapshot.ts

# Send a magic link to a user
tsx backend/scripts/send-magic-link.ts crystal@esexpressllc.com
```

All scripts are read-only except the magic-link one.

---

_If anything here looks wrong, regenerate the underlying script. Docs derive from data, data derives from production. Drift = stop and ask._
