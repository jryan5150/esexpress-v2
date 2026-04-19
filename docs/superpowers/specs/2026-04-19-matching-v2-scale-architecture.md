# Matching v2 — Scale Architecture Spec

**Date:** 2026-04-19
**Author:** Jace / Opus 4.7 session
**Status:** Proposed · awaiting greenlight on Phase 7 scope
**Scope:** How the matching engine scales from today's 50 decisions/day / manual OCR / Phase 1-6 features to a production system ingesting 500-5,000 BOLs/day with continuous learning, cross-carrier templates, and multi-region resilience.

---

## Executive summary

Today: 14-feature scorer, pre-tuned weights, Claude-direct OCR, in-process rate limiter, one Postgres instance, manual-only driver crossref seeding.

The highest-leverage move is NOT more features. It's **taking the 5-10K historical JotForm BOL corpus, running it through the (now-Opus-4.7) extraction pipeline once, and using the resulting labeled decisions to bootstrap the Phase 3 tuner with 50,000+ real training features on day one.** Without this, the tuner starts cold and takes ~90 days to converge. With it, the system launches already-tuned.

Secondary: turn the extraction pipeline into a GCP-native, horizontally-scaled worker with Document AI + LayoutLMv3 as a dual-extractor to Claude. Cross-carrier template patterns (PropX/Logistiq/JotForm/JRT) emerge naturally from the labeled corpus and become per-source scoring priors.

---

## Section 1 — Corpus as training ground (THE move)

### The vision (Jace, 2026-04-19)

> Thousands of historical JotForm BOLs are the golden training ground. Run the corpus through the pipeline once, use the reconciliation outcomes as labels, and the scorer launches pre-trained against real operational patterns. PropX + Logistiq matches get smarter because the JotForm corpus tells us what a good match actually looks like.

### The pipeline

```
┌──────────────────────────────────────────────────────────────┐
│  CORPUS BACKFILL (one-time)                                  │
│                                                               │
│  5-10K JotForm BOL photos (zipped, ~50-60GB)                  │
│            │                                                  │
│            ▼                                                  │
│  Upload → gs://esexpress-bol-corpus/                          │
│            │                                                  │
│            ▼                                                  │
│  Cloud Run worker, parallelized at shard=64                   │
│    ├→ Claude Vision Opus 4.7 (15-field extraction)            │
│    ├→ (Phase 7) Document AI Form Parser + LayoutLMv3          │
│    └→ Facts Merger (confidence-tagged per-field)              │
│            │                                                  │
│            ▼                                                  │
│  Write to bol_submissions.ai_extracted_data (rich jsonb)      │
│            │                                                  │
│            ▼                                                  │
│  Reconciliation replay — match each BOL against historical    │
│  loads table; tag with matched_load_id + reconciliation       │
│  status (cleared / entered / uncertain / unmatched)           │
│            │                                                  │
│            ▼                                                  │
│  Synthetic match_decisions rows                               │
│    - cleared/entered BOLs    → label = 1 (confident match)    │
│    - uncertain BOLs          → label = 0 (skeptical match)    │
│    - unmatched BOLs          → label = -1 (no-match class)    │
│    - 5-10K rows × 14 features = 70K-140K labeled feature      │
│      observations for the tuner                               │
│            │                                                  │
│            ▼                                                  │
│  Phase 3 tuner cold-start run → initial production weights    │
│  + per-carrier weight overrides (see §4 templates)            │
└──────────────────────────────────────────────────────────────┘
```

### What we get out of it

- **Initial tuner weights on day 1.** Launch score accuracy projected 85-88% instead of 68% baseline.
- **Per-carrier priors.** Liberty / Logistiq / Scout / JRT each have distinct BOL patterns — tuner learns carrier-specific weight overrides.
- **Template extraction for the matcher.** Rulesets like "JRT BOLs always have format `JR-#####`" emerge as queryable patterns (§4).
- **Ranking calibration.** We learn the true score→confidence curve instead of guessing.
- **A/B measurement baseline.** When Phase 3 tuner runs nightly, we measure it against the corpus-derived baseline.

### Effort + cost

| Step | Effort | GCP cost |
| --- | --- | --- |
| Upload 50-60GB corpus to GCS | ~30 min + transfer time | <$5 one-time |
| Cloud Run worker (Python/TS) that iterates corpus through existing extraction service | 2 days | ~$5 |
| Claude Opus 4.7 extraction on 5-10K images | 1-2 days wall-clock | ~$300-500 one-time |
| Reconciliation replay + synthetic decisions write | 1 day | negligible |
| Phase 3 tuner cold-start run | 2 hours | negligible |
| **Total** | **~5 days** | **~$310-510 one-time, ~$5/mo ongoing** |

### Kickoff

Three concrete kickoffs to unblock the corpus pipeline:

1. **Corpus location** — confirm where the ZIPs live, get auth to upload to `gs://esexpress-bol-corpus/`
2. **GCP project ID** — confirm weavefield.io org + project for the Cloud Run worker + Document AI endpoints
3. **Anthropic budget** — confirm $500 one-time for Opus on 10K BOLs is authorized (can be billed via Vertex or direct API)

---

## Section 2 — Extraction pipeline at scale

### Today (in-process, doesn't scale past ~100 BOL/hr)

- `bol-extraction.service.ts` runs in the main Fastify backend process
- `PQueue` in-memory (concurrency=2, interval=5s, intervalCap=2)
- Claude direct via `@anthropic-ai/sdk` through Helicone proxy
- Single-model, no cross-validation
- Rate limit failures = retry with same process = cascade

### Target (GCP-native, horizontal, resilient)

```
JotForm webhook → Cloud Run HTTP endpoint
       │
       ▼
Cloud Storage (photo landing zone)
       │
       ▼ (GCS object finalize event)
Pub/Sub topic: bol.photos.uploaded
       │
       ▼
Cloud Run workers (autoscale 0 → N)
  ├→ Worker 1: Claude Opus 4.7 extractor (primary)
  ├→ Worker 2: Document AI Form Parser (cross-validator)
  └→ Worker 3: LayoutLMv3 fine-tuned (optional, post-corpus-training)
       │
       ▼
Pub/Sub topic: bol.facts.extracted (per-worker)
       │
       ▼
Facts Merger (Cloud Run)
  - Agreement → high confidence
  - Disagreement → flag + pick higher-conf source
  - Missing-from-one → tag "single-source"
       │
       ▼
Write to ES Express bol_submissions.ai_extracted_data (via
authenticated webhook or direct pg connection with connection
pooler)
       │
       ▼
Pub/Sub topic: bol.facts.merged → listeners:
  - Reconciliation service (triggers match)
  - Decision capture (snapshots score)
  - Alerting (low-confidence flagging)
```

### Scale characteristics

| Dimension | Today | Target |
| --- | --- | --- |
| Peak throughput | ~120 BOLs/hour | 500+ BOLs/hour |
| Median latency (BOL submitted → features on workbench) | ~30s | <10s |
| Cost at 50 BOL/day | ~$45/mo (Claude direct) | ~$50/mo (all GCP) |
| Cost at 5,000 BOL/day | ~$4,500/mo | ~$500/mo |
| Retry / DLQ | in-process counter | Pub/Sub native |
| Blast radius on failure | whole backend degrades | isolated to worker pool |
| Multi-region | no | yes (Pub/Sub regional) |

### Migration path

1. **Phase 7a — lift current extractor into Cloud Run** (1-2 days). Same single-model logic, but out of process. Environment variable toggles pipeline endpoint between inline (today) and Cloud Run (new).
2. **Phase 7b — add Document AI second extractor + Facts Merger** (3-5 days). Dual-model with confidence-weighted merge.
3. **Phase 7c — Pub/Sub event fabric** (2-3 days). Decouple webhook → upload → extract → merge → write.
4. **Phase 8 — LayoutLMv3 fine-tuned extractor** (1 week, post-corpus-training). Runs on Cloud Run GPU, becomes third extractor or replaces Document AI.

---

## Section 3 — Scorer at scale

Current scorer is pure function, 14 features, per-row invocation. Good to ~1M rows/day. Scale risks emerge elsewhere:

### Driver roster fetch

Today: fetched once per `listWorkbenchRows` call. At 5K unique drivers fetching a whole roster per request becomes expensive.

**Solution:** In-memory cache in the Fastify process keyed by `(driver_crossrefs.updated_at MAX)`. Invalidate on any crossref insert/update. Cache hit is <1ms; cold fetch ~50ms.

### `match_decisions` table growth

At 5K decisions/day = 1.8M rows/year. B-tree indexes on `created_at` + `action` keep reads fast. Growth concerns:

**Partitioning:** range-partition on `created_at` month. Tuner reads rolling 30d window — only 1 partition hot. Backfill queries scan cold partitions via their index.

**Retention:** move decisions older than 18 months to an archive table (or BigQuery for cross-cutting analytics). Live table stays lean.

### `bol_submissions.ai_extracted_data` jsonb

At 5K BOLs/day × 2KB average = 10 MB/day = 3.6 GB/year. Not a concern for storage, but for index performance:

**Solution:** GIN index on the `ai_extracted_data` jsonb once we start frequent field queries. Today we use correlated subqueries; if those hit >10ms p95, switch to a lateral join with GIN lookup.

### Tuner

Today the sketch in `scripts/simulate-tuner.ts` runs on the whole table in-memory. At 1.8M decisions that's ~500MB in-memory + 200 gradient passes ~5 minutes on a Cloud Run job instance.

**Phase 3 production shape:**

- Run nightly at 2 AM CT as a Cloud Run Job (not a Fastify route)
- Reads rolling 90-day window from `match_decisions`
- Writes new `scorer_config` row with `is_active = false`
- Posts summary to admin dashboard for one-click activation
- Optionally auto-activates if guardrails pass (accuracy delta +1% minimum, no feature weight moves >40% vs active)

---

## Section 4 — Cross-carrier templates + per-source priors

### The pattern

Carriers produce structurally different BOLs:
- **Liberty Trucking** — printed forms, high OCR confidence, clean numeric fields
- **Logistiq Express** — digital carrier export, no OCR needed, sometimes different field names
- **Scout Transport** — mixed; partial OCR on handwritten sections
- **JRT Transport** — often handwritten, low baseline OCR confidence, distinctive patterns

### The lift

Once the corpus is tuner-bootstrapped (§1), per-source weight overrides emerge:

```
scorer_config table (Phase 3):
  id | version | source_filter   | weights                            | is_active
  ---+---------+-----------------+------------------------------------+-----------
   1 |       1 | NULL (default)  | {bolMatch: 0.20, ...}              | true
   2 |       2 | 'propx'         | {bolMatch: 0.25, truckOcrMatch: 0.10, ...} | false
   3 |       3 | 'logistiq'      | {bolMatch: 0.15, weightDeltaPct: 0.15, ...} | false
   4 |       4 | 'jotform'       | {bolMatch: 0.30, ocrOverallConfidence: 0.10, ...} | false
```

### Template extraction

Beyond weights, certain patterns are structural (regex-level). After corpus training:

```
templates table:
  source   | pattern_type    | pattern              | confirmed_rate
  ---------+-----------------+----------------------+---------------
  jrt      | bol_format      | ^JR-\d{5}$           | 0.94
  liberty  | bol_format      | ^LBR-\d{6}-\d{2}$    | 0.91
  logistiq | load_no_format  | ^L\d{4}-\d+$         | 0.87
  propx    | ticket_no_range | 71000-79999          | 0.96
```

These templates become:
- **Ingest guardrails rules** — reject rows violating known format (Phase 2+ of ingest-guardrails branch)
- **Scorer priors** — give a load a bonus when it matches its source's known template
- **Anomaly detectors** — deviations from the template are training signal

---

## Section 5 — Observability at scale

What must be dashboard-visible on day 1 of Phase 7:

| Dashboard | Metric | Alert threshold |
| --- | --- | --- |
| Extraction pipeline | BOLs/hour throughput | <expected × 0.5 for 15 min |
| Extraction pipeline | P95 latency (upload → merged facts) | >30s sustained |
| Extraction pipeline | Claude OpExtension error rate | >2% over 5 min window |
| Extraction pipeline | Cross-extractor disagreement rate | >15% on any field |
| Scorer | Daily tier distribution (high/med/low/uncertain %) | shifts >10 points from baseline |
| Scorer | Feature coverage (% of rows with OCR populated) | <80% |
| Tuner | Nightly run success | any failure |
| Tuner | Accuracy delta vs. active config | new config >5% regression |
| DB | `match_decisions` insert rate | matches expected workbench activity |
| DB | `bol_submissions` with `ai_confidence<50` rate | >20% (OCR quality alert) |

**Tooling:** Cloud Monitoring custom dashboards + BigQuery export for long-tail analysis. Grafana overlay optional for on-call unification.

---

## Section 6 — Cost model at scale

| Scenario | Current 50/day | 500/day | 5,000/day |
| --- | --- | --- | --- |
| Claude Opus 4.7 direct ($X/image) | ~$45/mo | ~$450/mo | ~$4,500/mo |
| Claude Opus via Vertex AI | ~$45/mo | ~$450/mo | ~$4,500/mo |
| Document AI Form Parser | n/a | ~$100/mo | ~$1,000/mo |
| LayoutLMv3 on Cloud Run GPU (fine-tuned) | n/a | ~$25/mo | ~$100/mo |
| Cloud Storage (50GB corpus + ongoing) | $1 | $5 | $20 |
| Cloud Run workers | $10 | $30 | $200 |
| Pub/Sub | $0 | $5 | $50 |
| Postgres (match_decisions growth) | existing | existing | +$50 |
| **Best-case (LayoutLMv3 primary, Claude fallback)** | **$55/mo** | **$115/mo** | **$620/mo** |
| **Premium (Claude primary + Doc AI cross-check)** | **$55/mo** | **$580/mo** | **$5,570/mo** |

**The key insight:** at scale, LayoutLMv3 fine-tuned on the corpus beats Claude on cost by 10x. Corpus training pays for itself in the first month of 5K/day operation.

---

## Section 7 — Phased rollout

| Phase | Scope | When | Depends on |
| --- | --- | --- | --- |
| **Monday** | Workbench v5 + PCS + matching-v2 (0-6) + ingest-guardrails | This Monday | (shipping now) |
| **6.5** | Wire Phase 6 features into frontend tooltip (already shipped code-side, frontend label dict done) | post-Monday | Monday merge |
| **7a** | Corpus upload + Cloud Run extraction worker + backfill run (Section 1) | Week 1 post-Monday | GCP project confirm, corpus location, Anthropic budget |
| **7b** | Synthetic decision write + Phase 3 tuner cold-start | Week 2 | 7a complete |
| **7c** | Production Cloud Run + Pub/Sub + Document AI cross-validator | Week 3-4 | 7a, 7b stable |
| **8** | LayoutLMv3 fine-tune on labeled corpus + deploy as primary extractor | Week 5-6 | 7c stable + >1000 confirmed labels |
| **9** | Per-source template extraction + scorer priors (Section 4) | Week 7-8 | tuner has 30+ days of production decisions |
| **10** | Auto-tuner guardrails + auto-activation on accuracy lift (Section 3) | Month 3 | proven tuner stability |

---

## Open decisions

1. **Corpus storage location.** Confirm bucket name + region for `gs://esexpress-bol-corpus/`.
2. **Claude via Vertex AI vs. direct Anthropic.** Vertex = one GCP bill. Direct = simpler + Helicone tracing. Recommend Vertex for Phase 7+.
3. **Retention policy on `match_decisions`.** Recommend 18 months live, archive to BigQuery after.
4. **Template extraction confirmation rate threshold.** Rules reach production at >0.90 confirmed rate? >0.95? Operator-decided.
5. **Auto-activation of nightly tuner.** Safe-default is human-confirm; at what trust bar do we flip to automatic?

---

## What changes with this spec

Before: scattered improvements, manual tuner, cold-start learning, single-extractor OCR that doesn't scale.

After: corpus-bootstrapped tuner that launches pre-tuned, GCP-native event-driven extraction, cross-extractor resilience, per-carrier templates, fine-tuned LayoutLMv3 for cost-efficiency at scale, observable end-to-end.

**The corpus training is the unlock.** Everything else is infrastructure that makes the trained system operable.

---

_Spec — revise in place as decisions crystallize. Ship Phase 7a kickoff plan once corpus location + GCP project + Anthropic budget are confirmed._
