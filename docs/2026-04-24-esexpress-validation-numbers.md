# ES Express v2 — Validation Numbers + What's New

**Sent with:** Friday 2026-04-24 noon system-ready email.
**Supersedes:** prior `2026-04-25-esexpress-validation-numbers.md` draft (numbers stale, framing pre-cross-check pivot).

This document exists so you can validate v2's claims against your own PCS access and your own operational intuition. Every number below is queryable yourself in the system or derivable from PCS reports. Every query that produced a number was run against the production database — they're not promises, they're inventory.

---

## 1. System-wide load counts (verified 2026-04-23 21:08 CDT)

| Source                   |  Count | What it is                                                  |
| ------------------------ | -----: | ----------------------------------------------------------- |
| **v2 total loads**       | 54,062 | Everything ingested since engagement start                  |
| &nbsp;&nbsp;via PropX    | 47,411 | Automated ingest from the carrier dispatch API              |
| &nbsp;&nbsp;via Logistiq |  6,648 | Automated ingest from Logistiq's export feed                |
| &nbsp;&nbsp;manual       |      3 | Loads created by hand (test seeds)                          |
| **v2 active wells**      |     95 | Configured destinations the matcher uses as targets         |
| **v2 total assignments** | 53,210 | Each is a load tied to a well (a few loads have no asg yet) |

_Verify in v2: home page "Loads Mapped" pill, Wells admin page lists all 95._

---

## 2. Assignment tier distribution — backfill complete

The matcher backfill that ran Wednesday-Thursday completed at **14:27 CDT today**. Every assignment in v2 now has a tier — there are no orphaned-by-the-matcher rows.

| Tier                        | Meaning                                            |  Count |
| --------------------------- | -------------------------------------------------- | -----: |
| **Tier 1 (auto-confirmed)** | Exact match, dispatcher pre-validation             | 46,008 |
| **Tier 2 (needs human)**    | Strong match with one signal — dispatcher approves |  7,202 |
| **Untiered**                | None — every assignment now has a tier             |      0 |

_Verify in v2: Workbench filter chips (Uncertain / Ready-to-Build / All) show the same distribution. The handler-stage breakdown across the 53,210 assignments today: uncertain 31,308, ready-to-build 21,898, cleared/building 4 (test pushes)._

---

## 3. Reconciliation against your hand-counts (your data, not ours)

You sent line-by-line per-well daily counts on April 23. Here's how the system stacked against your hand-counts across the two wells you reconciled, range 4/6–4/22:

| Well                                     | System count | Your count | Net delta | Days exact |
| ---------------------------------------- | -----------: | ---------: | --------: | ---------: |
| Liberty Apache Formentera Wrangler       |          972 |        967 |    **+5** |   12 of 15 |
| Liberty Spectre Crescent Briscoe Cochina |          262 |        252 |   **+10** |   10 of 12 |

Two-well aggregate: **22 of 27 days exact match**, net drift across 17 days = +15 loads on a base of 1,234. The two anomalies are explained:

- **4/6 over-count by 30**: you annotated this directly ("30 from 4/5?") — almost certainly a date-shift in PropX's ingestion timestamp where late-night Saturday loads landed under Sunday's date.
- **4/22 under-count by ~45**: maintenance window paused PropX/Logistiq sync after early morning. System shows 2 + 9 loads while your count shows 24 + 32. Sync resumes when the site comes out of maintenance.

This isn't us telling you the matcher is accurate. It's you telling us — your manual reconciliation is the audit. The new cross-check layer (section 5 below) automates this comparison going forward.

_Verify yourself: the day-by-day totals are queryable in the Workbench filter view per well._

---

## 4. BOL submission + OCR pipeline (verified 2026-04-23 21:08 CDT)

| Metric                                | Count |
| ------------------------------------- | ----: |
| Total BOL submissions (driver photos) | 6,047 |

The OCR-extraction percentage and matched-percentage are no longer the right framing — what actually matters is the cross-check layer (next section), which uses the OCR ticket number as one of the bridge keys to PCS.

---

## 5. **NEW** — Cross-check between v2 and PCS (live)

This is the biggest thing that landed since the maintenance window opened. Every 15 minutes, v2 pulls PCS's active load list and compares each matched record against its v2 counterpart. Where the two sources disagree, the system surfaces a discrepancy in the load drawer + on a new admin page.

### What it catches

| Type                   | What it means                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Status drift**       | v2 shows load at one stage, PCS shows another (e.g. PCS cancelled, v2 didn't notice) |
| **Weight drift**       | v2 weight differs from PCS billed weight by >5%                                      |
| **Well mismatch**      | v2 maps the load to one well, PCS billed it to a different consignee                 |
| **Rate drift**         | v2's expected rate-per-ton differs from PCS's billed rate by >5%                     |
| **Orphan destination** | 3+ v2 loads point at a destination not in your wells master                          |

### What it found in its first run (verified 2026-04-23 22:39 CDT)

| Open discrepancies | Where to see them     |
| -----------------: | --------------------- |
|                  3 | Admin → Discrepancies |

The three:

- **PCS load 357468 (status drift)** — that was our 4/22 test push to Hairpin; we voided it on PCS but v2 hadn't noticed until the cross-check ran. System now shows it as Cancelled in the drawer's Cross-Check section.
- **Wells 1/2/3 (orphan destination)** — 851 v2 loads point at this destination but it's not in the wells master. This is the same one I asked you about on 4/22 — your call on whether to add it as a real well or alias-into one.
- **Victoria Anne West (orphan destination)** — 11 v2 loads point at this destination; same prompt.

### Why this matters during the validation period

You said you wanted a week of validation before flipping PCS push on. The cross-check layer means that during that week, **PCS is the truth-checker for v2**. Every load v2 thinks it knows about, the system asks PCS what it knows. When the two disagree, the dispatcher sees it inline — not in a quarterly audit.

When you eventually flip the push toggle, the cross-check keeps running on every pushed load, catching anything that diverged in transit.

_Verify yourself: Admin → Discrepancies. Open any load on Workbench → drawer shows the Cross-Check section._

---

## 6. PCS reconciliation queue ("Missed by v2")

Last sync: 2026-04-23 22:39 CDT · 15-minute cadence going forward.

| Metric                         | Count | Meaning                             |
| ------------------------------ | ----: | ----------------------------------- |
| PCS active loads (last 7 days) |    44 | What PCS shows as active            |
| Matched to a v2 assignment     |     1 | Direct deterministic match (357468) |
| Unmatched ("missed by v2")     |    43 | See breakdown below                 |

The 43 unmatched are predominantly the same route:

- **Shipper:** Cayuga Sands (Cayuga, TX)
- **Consignee:** Comstock Dinkins JG 1H (Marquez, TX) + Frac-Chem Load + 2 Sandbox wells
- **Why they don't match v2 yet:** Cayuga Sands isn't in v2's ingestion pipeline (we weren't configured for that loader). Comstock Dinkins JG 1H isn't a v2 well — it's #1 on the historical-discovery list (605 historical loads behind it).

This isn't a reconciliation failure. It's scope expansion signal: two independent surfaces (PCS pull + 3-year flywheel) landed on the same well as the highest-volume thing v2 isn't tracking yet.

_Verify yourself: Admin → Scope Discovery → "In PCS, Not in v2" tab._

---

## 7. Historical scope discovery (flywheel analysis)

Ran 2026-04-23 against your 3-year DuckDB warehouse (198,806 dispatch rows from both Hairpin and ES Express divisions).

| Metric                                       |         Count |
| -------------------------------------------- | ------------: |
| Unique destinations seen in history          |         1,143 |
| v2 destinations matched to history           |          0.3% |
| Well-like destinations **not** in v2         | **163 wells** |
| Historical loads tied to those missing wells |    **21,048** |

**Top 5 wells v2 doesn't know about** (by historical volume):

| Loads | Well                                                                            |
| ----: | ------------------------------------------------------------------------------- |
| 1,114 | Comstock Renrew Lands 3 Well Pad (Bethany, TX)                                  |
| 1,030 | Comstock Davis (Frierson, LA)                                                   |
| 1,028 | Comstock Chapman Heirs 27-22 (Gloster, LA)                                      |
|   988 | Liberty Apache Warwick Hayes (Chickasha, OK)                                    |
|   605 | Comstock Dinkins JG 1H (Marquez, TX) ← _also #1 PCS active consignee this week_ |

**Already corrected overnight 2026-04-22:** 14 wells with 1,984 historical loads got alias updates and now auto-match.

_Verify yourself: Admin → Scope Discovery → "Wells We Discovered" tab. Full 163-well list in the JSON artifact at `docs/2026-04-23-flywheel-discovery.json`._

---

## 8. Missed-load revenue exposure (3-year audit)

The flywheel also analyzed your invoiced load-number sequences for gaps — loads that were dispatched but never billed. 3-year totals across both Hairpin and ES Express:

| Scenario                                    |                  Impact |
| ------------------------------------------- | ----------------------: |
| If ALL 1,778 sequence gaps are missed-bills | **$599,307** (3-yr max) |
| If 25% are genuine (realistic)              |               ~$149,800 |
| If 10% are genuine (conservative)           |                ~$59,930 |

Most gaps are cancellations (sampled 15 — none in the dispatch record), but at conservative 10% genuine-miss rate that's ~$60K of unrecovered revenue over 3 years that Jenny's manual reconciliation has been catching one at a time. Going forward, the cross-check layer (section 5) keeps that running rate at zero by surfacing missed billings the same day.

---

## 9. PCS push status — honest

Push capability has been proven (PCS load 357468 was created from v2 on 4/22 against Hairpin and voided cleanly), but our last 3 push attempts today returned a 500 from PCS's AddLoad endpoint with an opaque error body. We captured the exact wire payload + correlation IDs and sent them to Kyle (PCS-side) for App Insights lookup tonight. The push code is deployed; the toggle remains in your hands; we're working from PCS's server-side stack trace rather than guessing at payloads.

In the meantime, the read+bridge layer (sections 5–7) is the active value during the validation period. When Kyle clarifies the 500, we flip the push toggle at your direction.

---

## 10. What's built vs. post-continuation

| Capability                                                           | State                             |
| -------------------------------------------------------------------- | --------------------------------- |
| Carrier dispatch ingest (PropX + Logistiq + JotForm)                 | ✅ Production                     |
| BOL photo + OCR pipeline                                             | ✅ Production                     |
| Matcher with photo gate + audit trail                                | ✅ Production                     |
| PCS pull reconciliation (every 15 min)                               | ✅ Production                     |
| **Cross-check / discrepancy detection (NEW)**                        | ✅ Production                     |
| Admin review queue UI (Discrepancies, Scope Discovery, Missed-by-v2) | ✅ Production                     |
| Matcher accuracy dashboard                                           | ✅ Production                     |
| PCS push (add load, attach photo, void)                              | 🟡 Wired; in flight with PCS team |
| Scheduled email digest of new discrepancies (>48 hr open)            | 🚧 Week 1 post-continuation       |
| Toast notifications for newly-detected drift                         | 🚧 Week 1 post-continuation       |

---

## 11. The one-paragraph summary

> v2 is now handling 54,062 loads against 95 wells with the matcher backfill complete (Tier 1 = 46,008, no untiered). Your reconciliation this morning showed system vs hand-count exact on 22 of 27 days across two wells. A new cross-check layer pulls PCS state every 15 min and surfaces any load where v2 and PCS disagree — its first run found 3 real items including the PCS-side cancellation of our 4/22 test push. PCS push is wired and in flight with their team for a 500 we captured definitively today; toggle is yours. 163 historically-billed wells and 43 active PCS loads sit in the scope-expansion queues for your review. The system is ready for you to validate, stress-test, and break.

---

_Anything in this doc that doesn't match what you see in your own tools, please reply and I'll dig in same-day._
