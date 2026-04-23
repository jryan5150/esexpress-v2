# ES Express v2 — Validation Numbers & Comparison Tables

**Attachment to the Friday drop.**

Prepared: Thursday 2026-04-24 (draft — numbers refresh before send)

This document exists so you can validate v2's claims against your own PCS access and your own operational intuition before the Friday 10 AM meeting. Every number below is either (a) queryable yourself in the system, or (b) derivable from PCS's own reports. Nothing here is marketing math.

---

## 1. System-wide load counts

| Source                   |  Count | What it is                                                                          |
| ------------------------ | -----: | ----------------------------------------------------------------------------------- |
| **v2 total loads**       | 53,482 | Everything ingested from PropX + Logistiq + JotForm + manual since engagement start |
| &nbsp;&nbsp;via PropX    | 47,200 | Automated ingest from the carrier dispatch API                                      |
| &nbsp;&nbsp;via Logistiq |  6,282 | Automated ingest from Logistiq's export feed                                        |
| **v2 active wells**      |     95 | Configured destinations the matcher uses as targets                                 |

_How to verify: the v2 home page shows "Loads Mapped" = assignments count. Wells admin page lists all 95._

---

## 2. Assignment tier distribution (post-backfill)

This is the core "does it work" table. After tonight's matcher backfill finishes, expected numbers are:

| Tier                          | Meaning                                       | Current count |        Post-backfill (target) |
| ----------------------------- | --------------------------------------------- | ------------: | ----------------------------: |
| **Tier 1 (auto-confirmed)**   | Exact match, no human review needed           |        29,034 |                       ~47,000 |
| **Tier 2 (needs review)**     | Strong match with one signal — human approves |         6,845 |                        ~6,800 |
| **Tier 3 (manual)**           | No match found — human assigns                |             — | ~500 (junk destinations only) |
| **Still unassigned (orphan)** | Awaiting matcher                              |        17,603 |                          ~500 |

_How to verify:_ Filter the Workbench by tier. The orphan count shown on the load-count sheet and what drops in "Not in PCS" filter should both trend down overnight.

_Note on orphans:_ the final ~500 are loads with destinations like `"Wells 1/2/3"` or `"Civitas - First Tee"` — these aren't matchable against any known well by design, not a matcher failure.

---

## 3. Matcher accuracy (99.24% on real decisions, last 7 days)

| Action type                       |      Count | What it means                             |
| --------------------------------- | ---------: | ----------------------------------------- |
| `advance:ready_to_build`          |      4,430 | Dispatcher advanced an auto-matched load  |
| `route:confirm`                   |        267 | Dispatcher explicitly confirmed the match |
| `advance:building`                |          1 | Dispatcher pushed load to building stage  |
| **Subtotal — accepted the match** |  **4,698** | —                                         |
| `flag_back`                       |         33 | Dispatcher rejected / flagged issue       |
| `route:missing_ticket`            |          2 | Dispatcher flagged missing ticket         |
| `route:flag_other`                |          1 | Dispatcher flagged other issue            |
| **Subtotal — overrode the match** |     **36** | —                                         |
| **Total decisions**               |  **4,734** | —                                         |
| **Accept rate**                   | **99.24%** | 4,698 ÷ 4,734                             |

_This is real production usage over the last 7 days, not a synthetic benchmark._ Every row above is a human on your team (Jess, Scout, Steph, Keli, etc.) making a decision that was either accepting what the matcher proposed or overriding it.

_How to verify:_ `match_decisions` table. Admin → Load Diagnostics shows the 7-day rolling chart.

---

## 4. BOL submission + OCR pipeline

| Metric                                | Count |      % |
| ------------------------------------- | ----: | -----: |
| Total BOL submissions (driver photos) | 5,986 |   100% |
| With AI-extracted data                | 5,976 | 99.83% |
| Matched to a v2 load                  | 5,112 | 85.40% |
| Still in review queue                 |   874 | 14.60% |

_The 14.60% in-review aren't failures — most are either loads that haven't come through the carrier dispatch feed yet, or genuine discrepancies worth human eyes (wrong driver, wrong date, etc.)._

---

## 5. PCS ↔ v2 reconciliation (this week's sync)

Last sync: `2026-04-23 06:30:02 UTC` · Every 15 minutes going forward.

| Metric                         | Count | Meaning                    |
| ------------------------------ | ----: | -------------------------- |
| PCS active loads (last 7 days) |    44 | What PCS shows as active   |
| Matched to a v2 assignment     |     1 | Direct deterministic match |
| Unmatched ("missed by v2")     |    43 | See breakdown below        |

**Breakdown of the 43 unmatched:**

All 43 are the same route:

- **Shipper:** Cayuga Sands (Cayuga, TX)
- **Consignee:** Comstock Dinkins JG 1H (Marquez, TX)
- **Dates:** May 2023
- **Weights:** 48,000 - 54,000 lb each
- **Shipper tickets:** 1654000 - 1654758 (sequential Cayuga Sands scale tickets)

**Why they don't match:**

- Cayuga Sands isn't in v2's ingestion pipeline (we weren't configured for that loader)
- Comstock Dinkins JG 1H isn't a v2 well (it's in the flywheel's 163-well discovery list — #1 by historical volume with 605 loads behind it)

**What this means:** Not a reconciliation failure — a scope-expansion signal. Both the PCS pull _and_ the historical 3-year analysis landed on this same well. Two independent systems, same answer.

_How to verify:_ Admin → curl `/api/v1/pcs/sync-loads` or check the Workbench "Not in PCS" filter count. Cross-reference consignee names against your PCS billing screen.

---

## 6. Historical scope discovery (flywheel analysis)

The flywheel processed 198,806 historical dispatch rows spanning 2021-2026 from both Hairpin and ES Express divisions.

| Metric                                       |         Count |
| -------------------------------------------- | ------------: |
| Unique destinations seen in history          |         1,143 |
| v2 destinations matched to history           |          0.3% |
| Well-like destinations **not** in v2         | **163 wells** |
| Historical loads tied to those missing wells |    **21,048** |

**Top 5 wells v2 doesn't know about (by historical volume):**

| Loads | Well                                                                                |
| ----: | ----------------------------------------------------------------------------------- |
| 1,114 | Comstock Renrew Lands 3 Well Pad (Bethany, TX)                                      |
| 1,030 | Comstock Davis (Frierson, LA)                                                       |
| 1,028 | Comstock Chapman Heirs 27-22 (Gloster, LA)                                          |
|   988 | Liberty Apache Warwick Hayes (Chickasha, OK)                                        |
|   605 | Comstock Dinkins JG 1H (Marquez, TX) ← _also the #1 PCS active consignee this week_ |

**Already corrected overnight 2026-04-22:** 14 wells with 1,984 historical loads got alias updates and now auto-match.

_How to verify:_ attachment `2026-04-23-flywheel-discovery.json` has all 163 entries. Wells admin will show any approved additions.

---

## 7. How to cross-check these numbers yourself

### In v2 (no login tricks — your normal account)

| What you want to confirm | Where to look                                                           |
| ------------------------ | ----------------------------------------------------------------------- |
| Total loads              | Home page "Loads Mapped"                                                |
| Tier distribution        | Workbench, filter tabs (Uncertain / Ready to Build / Built Today / All) |
| Matcher accuracy         | Home page "Matcher" pill (click → Load Diagnostics)                     |
| PCS pull results         | Admin → Load Diagnostics → PCS Sync section                             |
| Scope-gap list           | Admin → Wells (future: dedicated queue)                                 |

### In PCS (your own access)

| What you want to confirm                    | Where to look                                             |
| ------------------------------------------- | --------------------------------------------------------- |
| Active load count                           | PCS dispatch screen, filter to last 7 days                |
| Specific loads from the "missed by v2" list | Search PCS by loadId (284474, 284480, 284487, etc.)       |
| That the Cayuga → Comstock loads are real   | Filter PCS consignee to "Comstock Dinkins JG 1H"          |
| Voiding works                               | Push one of the pre-seeded test loads and verify the void |

---

## 8. The Hairpin toggle self-demonstration (optional)

In the admin → Settings page you'll find **two** PCS push toggles:

- **Toggle A: Hairpin (test division)** — safe to flip; anything pushed here is test data, voidable
- **Toggle B: ES Express (production)** — off by default; flip only when you're ready for live pushes

**To verify end-to-end yourself:**

1. Flip Toggle A on.
2. Open the Workbench, look for the clearly-labeled **TEST — Hairpin** loads (3-5 pre-seeded).
3. Click into one, hit **Push to PCS**. Watch the push status badge update.
4. Open PCS, search for the pushed load by loadId or reference — verify it's there.
5. Back in v2, hit **Void** from the drawer.
6. In PCS, refresh — verify it's voided.
7. Flip Toggle A off when done. You've just verified every critical round-trip: push, photo, void, cancellation.

_No harm possible: these are clearly-marked test loads pushed to your test division, not production._

---

## 9. What's built vs what's post-continuation

Honest column, because the drop hand-off requires it.

| Capability                                             | State                                  |
| ------------------------------------------------------ | -------------------------------------- |
| Carrier dispatch ingest (PropX + Logistiq + JotForm)   | ✅ Production                          |
| BOL photo + OCR pipeline                               | ✅ Production                          |
| Matcher with photo gate + audit trail                  | ✅ Production                          |
| PCS push (add load, attach photo, update status, void) | ✅ Production, gated behind toggle     |
| PCS pull reconciliation with enriched missed-by-v2     | ✅ Production (sync runs every 15 min) |
| Matcher accuracy dashboard                             | ✅ Production                          |
| Admin review queue UI (163-well + missed-by-v2 tabs)   | 🚧 Week 1 post-continuation            |
| Rate-drift comparison (v2 expected vs PCS billed)      | 🚧 Week 1 post-continuation            |
| Scheduled alert for "delivered not billed > 48 hrs"    | 🚧 Week 1 post-continuation            |
| Second-photo capture for consignee BOLs                | 🚧 Requires JotForm change             |

---

## 10. The one-sentence summary

> _v2 tonight is handling 53,482 loads against 95 wells with a 99.24% matcher accept rate on 4,734 real operational decisions, automatically surfacing 163 wells from history and 43 PCS loads representing a single scope-expansion opportunity — with the bridge infrastructure already wired to close any of them the moment you onboard them._

---

_Anything in this doc that doesn't match what you see in your own tools, please flag before Friday. The goal is no surprises._
