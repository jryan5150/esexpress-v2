# Truth Manifest — generated 2026-04-27T18:07:14.774Z

> Single source for externally-cited numbers. Regenerate via `tsx backend/scripts/truth-manifest.ts --markdown > docs/truth-manifest.md`. Drift = stop.

## Sheet Truth — last reconciled weeks

| Week | Sheet (Jenny) | v2 | Δ | Match % |
|---|---:|---:|---:|---:|
| 2026-04-26 | 1287 | 375 | -912 | 29.1% |
| 2026-04-19 | 1287 | 1488 | +201 | 84.4% |
| 2026-04-12 | 1509 | 1375 | -134 | 91.1% |
| 2026-04-05 | 1387 | 1279 | -108 | 92.2% |
| 2026-03-29 | 1837 | 1744 | -93 | 94.9% |
| 2026-03-22 | 1495 | 1482 | -13 | 99.1% |

## PCS Truth — Q1 2026

| Metric | Value |
|---|---:|
| PCS Q1 unique loads | 13,515 |
| v2 Q1 raw loads | 18,194 |
| In-scope (with v2 ingest path) | 13,010 |
| Scope gap (no v2 feed: JRT, Signal Peak) | 505 |
| **Real coverage %** | **96.3%** |

### PCS by customer (Q1 2026)

| Customer | PCS Loads |
|---|---:|
| Liberty Energy Services, LLC | 12,362 |
| Logistix IQ | 639 |
| JRT Trucking Inc | 447 |
| Signal Peak | 58 |
| Premier Pressure Pumping | 8 |
| Finoric  | 1 |

## Builder Matrix — last 2 weeks

### Week of 2026-04-19

| Builder | Customer | Total |
|---|---|---:|
| Crystal | — | 53 |
| Scout | Liberty Energy Services, LLC | 1106 |
| Steph | Logistix IQ | 420 |

### Week of 2026-04-12

| Builder | Customer | Total |
|---|---|---:|
| Scout | Liberty Energy Services, LLC | 1140 |
| Steph | Logistix IQ | 327 |

## v2 Internal Vitals

| Metric | Value |
|---|---:|
| Photo attachment % | 97% |
| Sync run success % (24h) | 97.9% |
| Open discrepancies | 11 |

## Citation Guide

**OK to cite externally:**
- Sheet vs v2 weekly parity — externally verifiable against Jenny's Load Count Sheet
- PCS Q1 capture % — externally verifiable against PCS billing
- PCS by-customer breakdown
- Builder matrix totals — Jess hand-computes these every Friday
- Open discrepancy count + breakdown
- Photo attachment % (operational vital)

**Avoid citing without context:**
- v2 total load count without sheet/PCS context
- Match-tier counts — match_decisions stale since 2026-04-21
- Driver-codes anything — table is empty pending Jess's input on canonical sheet
- X loads dispatched / Y matched — auto-promote not shipped, pending dominates
