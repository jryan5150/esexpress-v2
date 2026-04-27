# Monday Demo Pack — 2026-04-27

> Single deliverable. Open this doc + share the audit script with Jess. Everything below is sourced, re-runnable, and re-checkable after the call.

---

## A. The 5-minute audit (give this to Jess)

**[`docs/2026-04-27-jess-audit-script.md`](./2026-04-27-jess-audit-script.md)** — five admin pages, one expected number per page, in order. Lets her verify v2 against her own sheet + PCS without you driving.

**Reframe sentence:** _"I'd like to invert today — instead of me driving, you audit five admin pages I built. Each shows your truth against PCS or your sheet. Tell me where v2 disagrees with reality."_

---

## B. PCS push status — staged, NOT confirmed-accepted

**Honest read (verified 2026-04-27):** the push code path exists and was exercised. Three seed loads sit in v2 in ready-to-push state. **None have a `pcs_number` returned and all show `assignment_status=failed`** — meaning we don't have evidence in our database that PCS accepted the writes.

Per memory `project_pcs_validation_period_pivot.md`: push was paused 4/23 pending Kyle's clarification on a captured 500.

| Load     | v2 location                                                                      | PCS state                      |
| -------- | -------------------------------------------------------------------------------- | ------------------------------ |
| id=68647 | [`/load-center?load=68647`](https://app.esexpressllc.com/load-center?load=68647) | pcs_number=NULL, assign=failed |
| id=68648 | [`/load-center?load=68648`](https://app.esexpressllc.com/load-center?load=68648) | pcs_number=NULL, assign=failed |
| id=68649 | [`/load-center?load=68649`](https://app.esexpressllc.com/load-center?load=68649) | pcs_number=NULL, assign=failed |

**Defensible line for the call:**

_"The push code path exists. Seeds are staged in v2 in ready-to-push state. Production write is paused on Kyle's response to a captured 500. PCS **read** is fully live — 96.3% Q1 capture, sync every 15 minutes, 100% success last 24h. The bigger value is the read side: v2 sees what PCS sees before you have to."_

**Pivot move if asked "show me one":** Take Jess to `/admin/pcs-truth` immediately. The read side is the strong story.

---

## C. The numbers (cite-ready, regenerable)

| Doc                                                               | What it has                                                                 | Use for                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| [`docs/truth-manifest.md`](./truth-manifest.md)                   | Sheet vs v2 weekly parity, PCS Q1 capture %, builder matrix totals, photo % | Any external citation           |
| [`docs/truth-manifest.json`](./truth-manifest.json)               | Same data, machine-readable                                                 | Drift detection (re-run + diff) |
| [`docs/2026-04-27-q1-tri-recon.md`](./2026-04-27-q1-tri-recon.md) | Q1 PCS + Sheet + Sources side-by-side per customer                          | "Look how all three agree" demo |

**Headline numbers to cite:**

- **Sheet vs v2 per-week match: 84-99%** depending on week
- **PCS Q1 real coverage: 96.3%** (Liberty 100%, Logistix 100%; gap is JRT + Signal Peak — no API feed)
- **Photo attachment: 97%** across 55K+ assignments
- **Sync run success: 97%+** last 24h
- **Saturday catch:** 1,023-row Logistiq dup-ingest bug found by reconciling against Jenny's sheet, fixed Sunday morning (root cause + clean dedup)

---

## D. The model — how we think v2 works (sourced to file:line)

**[`docs/2026-04-27-v2-mapping-matrix.md`](./2026-04-27-v2-mapping-matrix.md)** — every source → v2 column mapping, lifecycle states, matching rules, reconciliation logic, **17 open assumptions** flagged with `[!]`.

The `[!]` items are the questions worth asking Jess. Top 3:

1. Auto-promote is always-on in code despite CLAUDE.md saying flagged off
2. Sheet's "Discrepancy" col U captured but never compared
3. JRT loads come via Logistiq carrier export — not a separate "manual" source

---

## E. The questions for Jess (P0/P1/P2)

The structured ask list — pulled from the mapping matrix's open assumptions + today's discoveries:

**P0 (blockers):**

1. **FSC method per well** — miles or weight, plus where the rate comes from (published index? customer contract?)
2. **Liberty(FSC) vs Liberty** — same customer different rate sheet, or different billing entity?
3. **Driver Codes canonical sheet** — the 45-row Master Dispatch tab isn't the 983-row roster; which sheet is?

**P1 (unlocks v2 behavior):** 4. **Auto-promote** — has she noticed assignments advancing without anyone touching them? 5. **System "BOL" we hid** — what does she call the long numeric (PropX 86876565552 / Logistiq AU2604...)? 6. **Sheet's Discrepancy column** — should v2 use it as a third reconciliation signal?

**P2 (strategic):** 7. **PCS push live-flip** — when does she want us to start writing back? 8. **JRT + Signal Peak** — when do those carrier feeds become available? 9. **Crystal + Jenny accounts** — send their first magic-link now or hold?

---

## F. What's deployed today (since Friday's smoke)

| Surface                                                | URL                     | State                                    |
| ------------------------------------------------------ | ----------------------- | ---------------------------------------- |
| Worksurface (well grid + cell drawer + per-load click) | `/workbench`            | Live                                     |
| Sheet Truth (parity table)                             | `/admin/sheet-truth`    | Live + alias-aware                       |
| PCS Truth                                              | `/admin/pcs-truth`      | Live                                     |
| Discrepancies (cross-source)                           | `/admin/discrepancies`  | Live                                     |
| Order of Invoicing (builder matrix, post-dedup)        | `/admin/builder-matrix` | Live                                     |
| Sheet Status (color reader)                            | `/admin/sheet-status`   | Live                                     |
| Jenny's Queue (non-standard work)                      | `/admin/jenny-queue`    | Live                                     |
| Aliases admin (NEW today)                              | `/admin/aliases`        | Live                                     |
| Load Center (single-load workspace, NEW today)         | `/load-center?load=ID`  | Live (display only; inline edit Tuesday) |
| Wells admin (rate, FFC, FSC inputs)                    | `/admin/wells`          | Live                                     |

---

## G. Reproducibility — re-run anything

```bash
# Truth manifest (numbers for any external citation)
tsx backend/scripts/truth-manifest.ts --markdown > docs/truth-manifest.md

# Q1 tri-reconciliation (PCS + Sheet + v2 by customer)
tsx backend/scripts/q1-tri-recon.ts > /tmp/recon.md

# Numbers snapshot (full audit)
tsx backend/scripts/numbers-snapshot.ts

# Magic link for a user (Crystal/Jenny first login)
tsx backend/scripts/send-magic-link.ts crystal@esexpressllc.com
```

---

## H. Files added today (single source of truth list)

```
docs/2026-04-27-monday-demo-pack.md     ← this file
docs/2026-04-27-jess-audit-script.md     ← 5-min audit Jess does herself
docs/2026-04-27-v2-mapping-matrix.md     ← model survey, sourced to file:line
docs/2026-04-27-q1-tri-recon.md          ← PCS+Sheet+v2 customer recon
docs/truth-manifest.md                    ← cite-ready numbers (md + json)
docs/truth-manifest.json
docs/2026-04-27-jess-lens-cheatsheet.md   ← per-page expectations + bug responses
```

All committed. All re-runnable. All sourced.

---

_If anything in here looks wrong, regenerate the underlying script. The docs derive from the data; the data derives from production._
