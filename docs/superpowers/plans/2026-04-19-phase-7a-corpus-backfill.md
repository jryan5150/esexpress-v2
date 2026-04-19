# Phase 7a — Corpus Backfill Kickoff Plan

**Date:** 2026-04-19
**Branch target:** `feature/matching-v2-corpus-backfill` cut from `feature/matching-v2`
**Parent spec:** `docs/superpowers/specs/2026-04-19-matching-v2-scale-architecture.md` §1
**Status:** Ready to start, pending Anthropic billing decision
**Effort:** ~3 days + ~$90 one-time
**Outcome:** Scorer launches pre-trained at 82-86% accuracy with per-carrier weight overrides day one.

---

## Confirmed inputs

| Item | Value |
| --- | --- |
| GCP Project | `esexpress-dispatch` (284348866856) |
| Corpus bucket | `gs://esexpress-weight-tickets/` |
| Photo count | 5,958 |
| Total size | 14.37 GB |
| Region | `us-central1` |
| Auth | `noc@lexcom.com` (SA to be created for the worker) |

## Single open decision

**Anthropic billing pathway:**
- **Option A — Direct Anthropic API via Helicone** (existing setup). Fastest to ship. Uses the same client path as the in-process extractor. Billed to Anthropic.
- **Option B — Vertex AI Claude** (recommended long-term). Single GCP bill, no separate vendor relationship, but requires enabling Vertex AI API + provisioning quota + rewriting the client from `@anthropic-ai/sdk` to `@google-cloud/vertexai`.

Recommend Option A for Phase 7a (ship the corpus backfill this week), migrate to Vertex in Phase 7c when we GCP-ify the steady-state extraction pipeline.

## Pre-flight — one-time setup (~30 min)

1. **Enable required GCP APIs** on `esexpress-dispatch`:
   ```bash
   gcloud services enable run.googleapis.com \
     cloudbuild.googleapis.com \
     artifactregistry.googleapis.com \
     storage.googleapis.com \
     --project=esexpress-dispatch
   ```

2. **Create service account** for the worker:
   ```bash
   gcloud iam service-accounts create bol-backfill-worker \
     --display-name="BOL corpus backfill worker" \
     --project=esexpress-dispatch

   gcloud storage buckets add-iam-policy-binding gs://esexpress-weight-tickets \
     --member="serviceAccount:bol-backfill-worker@esexpress-dispatch.iam.gserviceaccount.com" \
     --role="roles/storage.objectViewer"
   ```

3. **Add Postgres connection** for the worker (writes to `bol_submissions.ai_extracted_data`). Options:
   - Cloud SQL Proxy sidecar (Railway DB isn't in GCP though)
   - Direct TCP from Cloud Run over Railway's public endpoint (auth via `DATABASE_URL` secret)
   - Recommended: direct TCP with Railway's connection string, secret stored in Secret Manager

4. **Create secrets** (Anthropic key, Railway DB URL):
   ```bash
   gcloud secrets create anthropic-api-key --project=esexpress-dispatch
   gcloud secrets create railway-database-url --project=esexpress-dispatch
   ```

## Phase 7a deliverables (3 days)

### Day 1 — Worker infrastructure

**Branch:** cut `feature/matching-v2-corpus-backfill` from `feature/matching-v2` (worktree at `.worktrees/matching-v2-corpus-backfill`)

**Scope:**
- `infra/corpus-backfill/` directory with:
  - `Dockerfile` — Python 3.12, thin image, runs a one-shot backfill script
  - `main.py` — iterates over `gs://esexpress-weight-tickets/**`, for each photo:
    - Download to tmpfs
    - Invoke the extraction service (same prompt template + `claude-opus-4-7`)
    - Write `ai_extracted_data` to `bol_submissions` (creating rows where none exist for that photo path)
    - Emit progress metric
  - `requirements.txt` — `google-cloud-storage`, `anthropic`, `psycopg2-binary`, `pydantic`
  - `cloudbuild.yaml` — build + push to Artifact Registry + deploy as Cloud Run Job
- `scripts/corpus-run.sh` — kicks off the Cloud Run Job with concurrency=8
- Local sanity test: `python main.py --limit 5` against dev DB before running for real

**Why Cloud Run Job (not Service):** one-shot batch work, can't scale a service down to zero mid-job, and Cloud Run Jobs have native parallelism via `--tasks=N`.

### Day 2 — Pass 1 (Opus extraction) + Pass 2 (reconciliation labeling)

**Scope:**
- **Pass 1:** Execute the Cloud Run Job across all 5,958 photos.
  - Parallelism: `--tasks=8 --max-retries=2`
  - Expected wall-clock: ~2-3 hours
  - Expected cost: ~$90 (Opus 4.7 at ~$0.015/image)
  - Rate-limited via PQueue-equivalent in Python (6 concurrent / 10s interval per worker × 8 workers = 48 qps peak, well under Anthropic's 50 RPM Opus limit per org-tier-4 account)
  - Monitor: Cloud Logging for errors, progress counter every 100 images
- **Pass 2:** Reconciliation replay against historical `loads` table
  - New script: `backend/scripts/replay-reconciliation.ts`
  - For each newly-extracted BOL, invoke the existing `reconciliation.service.ts` matching logic
  - Classify outcome: clean / partial / no-match / multi-match
  - Write synthetic `match_decisions` rows tagged with outcome bucket

**Checkpoint at end of day 2:**
- 5,958 `bol_submissions` rows have populated `ai_extracted_data`
- `match_decisions` table has ~5,958 synthetic labeled rows
- Cost actuals recorded

### Day 3 — Pass 3 (pattern mining) + Pass 4 (tuner bootstrap)

**Scope:**
- **Pass 3:** Pattern mining script (`backend/scripts/mine-corpus-patterns.ts`)
  - Per-carrier confidence distributions (JSON output)
  - BOL format regex extraction (find common prefixes like `JR-`, `LBR-`, numeric ranges)
  - OCR-vs-load field agreement rates
  - Output three files in `docs/corpus-analysis/`:
    - `template_candidates.json` — proposed ingest-guardrails rules per carrier
    - `field_trust_priors.json` — which fields are reliable per carrier
    - `anomaly_catalog.json` — top ~300 hard cases (bucket B/C/D) for review
- **Pass 4:** Tuner bootstrap
  - Run the logistic-regression sim from `scripts/simulate-tuner.ts` against the full labeled corpus (not just the 60-row seed)
  - Output: 5 new `scorer_config` rows (1 global + 4 per-carrier), `is_active=false`
  - Human review package: accuracy delta vs baseline, weight change summary, sample predictions

**Checkpoint at end of day 3:**
- 5 `scorer_config` rows ready for one-click activation
- 3 artifact files in `docs/corpus-analysis/` for Jessica review
- PR ready: `feature/matching-v2-corpus-backfill` → `feature/matching-v2`
- Revised accuracy numbers measured (not projected) against the corpus

## Monday-merge positioning

Phase 7a work happens AFTER the Monday deploy:
- Monday ships Workbench v5 + PCS + matching-v2 (Phases 0-6) + ingest-guardrails with factory-default weights
- Phase 7a runs in the background of the week (it's a Cloud Run Job + analysis scripts, not a production deploy)
- End of next week: the 5 new `scorer_config` rows are ready for activation — you/Jessica flip to the per-carrier-tuned config in a single UI click

This keeps Phase 7a **out of the Monday critical path** while still delivering the accuracy lift within 7 days of launch.

## Success criteria

- [ ] 5,958 photos successfully extracted via Opus (≥98% non-error rate)
- [ ] ~5,800+ synthetic `match_decisions` rows written (allowing for some no-matches)
- [ ] Accuracy gain measured at ≥15 percentage points vs baseline after tuner bootstrap
- [ ] Per-carrier weight variance observed (carriers produce different tuned configs, proving the corpus has carrier-specific signal)
- [ ] Anomaly catalog surfaces at least 50 hard cases worth manual review
- [ ] No Anthropic rate-limit 429s during Pass 1 (rate limiter works)
- [ ] Total cost ≤ $120 (10% over budget tolerance)

## Rollback / safety

- Pass 1 is idempotent — re-running on the same photo updates `ai_extracted_data` in place via the existing submission ID
- `scorer_config` rows land `is_active=false` — no production scorer behavior change until explicit activation
- Worker SA has `storage.objectViewer` ONLY — can't delete or modify the corpus
- Railway DB writes are additive (inserts to bol_submissions + match_decisions); no destructive operations

## Follow-on phases (post-7a)

| Phase | Scope | Depends on |
| --- | --- | --- |
| 7b | Per-carrier `scorer_config.source_filter` wired into the scorer read path | 7a complete, config reviewed |
| 7c | Steady-state extraction moves from in-process Fastify to Cloud Run + Pub/Sub | 7a proves the Cloud Run worker shape works |
| 8 | LayoutLMv3 fine-tuned on the corpus, deployed as primary extractor (Claude becomes cross-validator) | 7a + curated labeled subset ready |

---

_End of Phase 7a kickoff. Ready to start when Anthropic billing decision lands (Option A recommended)._
