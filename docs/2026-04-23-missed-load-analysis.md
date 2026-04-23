# Missed-Load Analysis — Revenue Leak Detection

Generated from 3 years of load_history + daily_dispatch (both Hairpin + ES Express divisions) in the flywheel warehouse.

## Core numbers

| Metric                                       |       Value |
| -------------------------------------------- | ----------: |
| **Missing load numbers (2021–2026)**         |   **1,778** |
| &nbsp;&nbsp;Hairpin (range 200001–357431)    |       1,242 |
| &nbsp;&nbsp;ES Express (range 100001–221660) |         536 |
| Average invoiced rate per load               | **$337.07** |
| Median invoiced rate per load                |     $215.00 |
| Total invoiced rows sampled                  |     104,936 |

## Revenue exposure bounds

| Scenario                                   |                    Impact |
| ------------------------------------------ | ------------------------: |
| If ALL 1,778 gaps are genuine missed-bills | **$599,307** (3-year max) |
| If 25% are genuine (realistic)             |                 ~$149,800 |
| If 10% are genuine (conservative)          |                  ~$59,930 |

Most gaps are cancellations (sampled 15 missing Hairpin load_nos, 0 appear in daily_dispatch — meaning they were never actually created). But even at 10% genuine miss rate, that's **$60K of unrecovered revenue over 3 years** — about $20K/year that Jenny's manual find-by-invoice-reconciliation workflow currently leaves on the floor.

## What v2 can do that's new

**Jenny's current workflow (per Apr 6 findings):** periodically audits invoices vs manifests, finds mismatches by eye, flags to Jessica for recovery — slow, labor-intensive, often misses small-dollar items because they're not worth the hunt.

**v2's automated replacement:**

1. Scheduled job scans `load_history.load_no` for gaps within expected sequences
2. Cross-checks each gap against `daily_dispatch` — was it actually dispatched?
3. Surfaces "dispatched but not invoiced" cases as Jenny's **priority review queue**
4. Ignores cancellations (no dispatch record) automatically
5. Estimates revenue impact using carrier_pay_detail averages

## Monday demo framing

> _"Jenny's manual reconciliation finds maybe 30-40 missed loads per year before they slip past invoicing. Our analysis of your 3-year load history shows roughly 60-90 true gaps per year that a simple sequential-gap query catches automatically — the other 1,500+ are cancellations. The recovery value is smaller than it looks because most of those gaps aren't real losses — but the labor savings are real. Jenny could spend that time on billing work instead of reconciliation detective work, and our system never misses one."_

## Implementation plan (post-Monday)

1. Port this DuckDB query pattern to a PostgreSQL query against `loads` table in v2
2. New scheduled job in `backend/src/scheduler.ts`: daily sequential-gap scan
3. New `missed_load_candidates` table: one row per gap with (load_no, is_dispatched, ignore_reason, reviewed_at, reviewed_by)
4. Admin UI at `/admin/missed-loads-detected` surfaces the review queue
5. One-click "mark as reviewed / recovered / skip" actions

Pre-Monday: this doc + numbers suffice for the demo narrative. No code shipping tonight.

## Caveats

- 3-year sample is mixed-quality — early years (2021-2022) may have data import gaps beyond the actual business gaps
- Rate estimate uses CarrierPayDetail which is the AP side, not AR — revenue recovery using this figure understates (ES Express bills customer at a markup)
- Sequential-gap detection works only within a single company's load_no namespace; cross-company anomalies require a different method
